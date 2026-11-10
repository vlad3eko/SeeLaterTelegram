import type {SoundCue, WhisperTranscript, WordTiming} from '../types.js';

type WhisperJsonSegment = {
    start: number;
    end: number;
    text: string;
    language?: string;
};

type OpenSoundCue = {
    marker: '*' | '[';
    start: number;
    end: number;
    parts: string[];
};

const KNOWN_SOUND_LABELS = new Set([
    'СМЕХ', 'СМЕЮТСЯ', 'СМЕЁТСЯ', 'ХОХОТ', 'КРИК', 'КРИКИ', 'ВСКРИК',
    'АПЛОДИСМЕНТЫ', 'ВЗДОХ', 'СТОН', 'ПЛАЧ', 'ШЁПОТ', 'ШЕПОТ',
    'КАШЕЛЬ', 'ЗВОНОК', 'ЗВУК', 'ЗВУК ОТМЕЧАНИЯ', 'МУЗЫКА', 'ШУМ',
    'ВЗРЫВ', 'ВЫСТРЕЛ', 'УДАР', 'РЁВ', 'РЕВ', 'СКРИП', 'ДВИЖЕНИЕ',
]);

function parseLine(line: string, lineNumber: number): WhisperJsonSegment {
    try {
        return JSON.parse(line) as WhisperJsonSegment;
    } catch {
        // FFmpeg's whisper filter can write quotes in recognized text without JSON-escaping them.
        const startPrefix = '{"start":';
        const endMarker = ',"end":';
        const textMarker = ',"text":"';
        const languageMarker = ',"language":"';
        const startIndex = line.indexOf(startPrefix);
        const endIndex = line.indexOf(endMarker, startPrefix.length);
        const textIndex = line.indexOf(textMarker, endIndex + endMarker.length);
        const languageIndex = line.lastIndexOf(languageMarker);
        const closingIndex = line.lastIndexOf('"}');

        if (startIndex !== 0 || endIndex < 0 || textIndex < 0 || languageIndex < 0 || closingIndex < languageIndex) {
            throw new Error(`Unsupported FFmpeg Whisper JSON line ${lineNumber}: ${line.slice(0, 250)}`);
        }

        const start = Number(line.slice(startPrefix.length, endIndex));
        const end = Number(line.slice(endIndex + endMarker.length, textIndex));
        const text = line.slice(textIndex + textMarker.length, languageIndex);
        const language = line.slice(languageIndex + languageMarker.length, closingIndex);
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
            throw new Error(`Invalid Whisper timestamps on line ${lineNumber}.`);
        }
        return {start, end, text, language};
    }
}

function seconds(segment: WhisperJsonSegment): { start: number; end: number } | undefined {
    const start = segment.start / 1000;
    const end = segment.end / 1000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return undefined;
    return {start, end};
}

function cleanSoundLabel(value: string): string {
    return value
        .replace(/[\*\[\]]/gu, ' ')
        .replace(/[\t\r\n]+/gu, ' ')
        .replace(/\s{2,}/gu, ' ')
        .trim()
        .replace(/^[,.;:!?…]+|[,.;:!?…]+$/gu, '')
        .toLocaleUpperCase('ru-RU');
}

function addSoundCue(cues: SoundCue[], text: string, start: number, end: number): void {
    const cleaned = cleanSoundLabel(text);
    if (!cleaned || cleaned === 'BLANK_AUDIO' || cleaned === 'NO SPEECH') return;
    if (!/[\p{L}\p{N}]/u.test(cleaned)) return;
    cues.push({text: cleaned, start, end: Math.max(start + 0.08, end)});
}

/**
 * Parses Whisper word segments and keeps non-speech annotations separately.
 * Supports one-segment markers (*LAUGH*) and markers split across segments.
 */
export function parseWhisperTranscriptNdjson(contents: string): WhisperTranscript {
    const words: WordTiming[] = [];
    const soundCues: SoundCue[] = [];
    const lines = contents.split(/\r?\n/u).filter((line) => line.trim().length > 0);
    let openCue: OpenSoundCue | undefined;

    const finishOpenCue = () => {
        if (!openCue) return;
        addSoundCue(soundCues, openCue.parts.join(' '), openCue.start, openCue.end);
        openCue = undefined;
    };

    const addSpeechToken = (
        text: string,
        start: number,
        end: number,
        language?: string,
    ) => {
        const token = text.trim();
        if (!token) return;

        const previousWord = words.length > 0
            ? words[words.length - 1]
            : undefined;

        if (
            /^[,.;:!?…)}\]»”’"'—–-]+$/u.test(token) &&
            previousWord
        ) {
            previousWord.text += token;
            previousWord.end = Math.max(previousWord.end, end);
            return;
        }

        words.push({text: token, start, end, language});
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        if (line === undefined) continue

        const segment = parseLine(line.trim(), index + 1);
        const rawText = String(segment.text ?? '').trim();
        if (!rawText || rawText === '[BLANK_AUDIO]' || rawText === 'BLANK_AUDIO') continue;
        const timing = seconds(segment);
        if (!timing) continue;

        let text = rawText;

        if (openCue) {
            const closingMarker = openCue.marker === '*' ? '*' : ']';
            const closeIndex = text.indexOf(closingMarker);
            if (closeIndex < 0) {
                openCue.parts.push(text);
                openCue.end = timing.end;
                // A malformed, never-closed marker must not swallow the whole transcript.
                if (openCue.parts.length >= 6 || timing.end - openCue.start > 2.5) finishOpenCue();
                continue;
            }
            openCue.parts.push(text.slice(0, closeIndex));
            openCue.end = timing.end;
            finishOpenCue();
            text = text.slice(closeIndex + 1).trim();
            if (!text) continue;
        }

        const marker = text[0] === '*' ? '*' : text[0] === '[' ? '[' : undefined;
        if (marker) {
            const closingMarker = marker === '*' ? '*' : ']';
            const closeIndex = text.indexOf(closingMarker, 1);
            if (closeIndex >= 0) {
                addSoundCue(soundCues, text.slice(1, closeIndex), timing.start, timing.end);
                text = text.slice(closeIndex + 1).trim();
                if (!text) continue;
            } else {
                openCue = {
                    marker,
                    start: timing.start,
                    end: timing.end,
                    parts: [text.slice(1)],
                };
                continue;
            }
        }

        const soundLabel = cleanSoundLabel(text);
        if (KNOWN_SOUND_LABELS.has(soundLabel)) {
            addSoundCue(soundCues, soundLabel, timing.start, timing.end);
            continue;
        }

        const tokens = text.split(/\s+/u).filter(Boolean);
        if (tokens.length > 1) {
            throw new Error(
                `Whisper returned a multi-word segment on line ${index + 1} (${JSON.stringify(text)}). ` +
                'Word-level timing is required; check max_len=1 and this FFmpeg build.',
            );
        }
        addSpeechToken(tokens[0] ?? '', timing.start, timing.end, segment.language);
    }

    finishOpenCue();
    words.sort((a, b) => a.start - b.start);
    soundCues.sort((a, b) => a.start - b.start);

    if (words.length === 0) {
        throw new Error('Whisper returned no speech tokens. Check the audio track, model and language.');
    }
    finishOpenCue();

    if (words.length === 0) {
        throw new Error(
            'Whisper returned no speech tokens. Check the audio track, model and language.',
        );
    }

// Проверяем порядок исходных сегментов ДО сортировки.
// Иначе сортировка скроет возможную проблему с таймкодами.
    for (let index = 1; index < words.length; index += 1) {
        const previousWord = words[index - 1];
        const currentWord = words[index];

        if (!previousWord || !currentWord) {
            continue;
        }

        if (currentWord.start + 0.02 < previousWord.start) {
            throw new Error(
                `Whisper timestamps are not monotonic near token ${index}.`,
            );
        }
    }

    words.sort((a, b) => a.start - b.start);
    soundCues.sort((a, b) => a.start - b.start);

    return { words, soundCues };
}

/** Backward-compatible word-only parser for any existing callers. */
export function parseWhisperNdjson(contents: string): WordTiming[] {
    return parseWhisperTranscriptNdjson(contents).words;
}

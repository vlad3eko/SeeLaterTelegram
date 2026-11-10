import { GoogleGenAI } from '@google/genai';

import type { WhisperTranscript, WordTiming } from '../types.js';
import { isBudgetExceeded, requestTimeoutMs, translateRequestTimeoutMs, withinBudget } from '../utils/budget.js';
import { isRateLimitError } from '../utils/rate-limit.js';
import { assertLanguageCode, stripControlCharacters } from '../utils/safe-input.js';

/**
 * Foreign speech inside a clip (an English or Italian line in a Russian reel)
 * is translated into the subtitle language, with the timing of the original
 * sentence, so the captions say what the viewer needs to understand.
 *
 * Steps (all inside the subtitle module):
 *  1. Sentences are cut from the transcript (sentence end, long pause or a
 *     speaker change).
 *  2. A sentence is foreign when the transcriber labelled its words with
 *     another language, or when most of its letters are in another script
 *     (Latin letters in a Cyrillic transcript). The script test needs no
 *     network and catches the usual case; Latin→Latin pairs (Italian in an
 *     English reel) need the transcriber's language label.
 *  3. All foreign sentences go to Gemini in ONE text request; the answer is
 *     JSON `[{id, text}]` in the subtitle language.
 *  4. The translated words are spread over the span of the original
 *     sentence by syllable weight; speaker and `sourceLanguage` are kept.
 *
 * The request is made only when it is needed. A clip in the subtitle language
 * has no foreign sentence, so nothing is sent; a stray foreign word or two in
 * such a clip ("OK", a brand name) is not worth a request either (see
 * isTrivialForeignSpeech). The request itself asks the model for little
 * thinking, because a line-by-line translation does not need it.
 *
 * A short Gemini outage ("503 high demand") must not cost the viewer the
 * translation. An overloaded model answers 503 only after about a minute, and
 * models have separate capacity (one is often fine while another is not), so
 * the chain is walked in rounds: every model gets one attempt per round, a
 * failing one hands over to the next at once, and the pause comes only after a
 * whole round. Each translation request is also limited to a few seconds
 * (REEL_SUBTITLE_TRANSLATE_REQUEST_TIMEOUT_MS, default 25 s).
 *
 * An optional last link of the chain is a model of another provider, so that
 * an outage of all Gemini models does not leave the captions untranslated. It
 * is off until REEL_SUBTITLE_TRANSLATE_EXTERNAL_API_KEY and
 * REEL_SUBTITLE_TRANSLATE_EXTERNAL_MODEL are set; the endpoint is any
 * OpenAI-compatible `chat/completions` URL
 * (REEL_SUBTITLE_TRANSLATE_EXTERNAL_URL, https only, OpenAI by default).
 *
 * Any failure that survives that keeps the transcript untouched.
 * REEL_SUBTITLE_TRANSLATE=off disables the step, REEL_SUBTITLE_TRANSLATE_MODEL
 * changes the main model, REEL_SUBTITLE_TRANSLATE_FALLBACK_MODEL (comma
 * separated, `none` to switch off) changes the models tried after it.
 * REEL_SUBTITLE_TRANSLATE_MIN_WORDS (default 3) is the least number of foreign
 * words that justifies a request in a clip that is mostly in the target language.
 */

const DEFAULT_TRANSLATE_MODEL = 'gemini-3.8-flash';
/** A model the project already uses for reels (hooks), so the same key works. */
const DEFAULT_FALLBACK_TRANSLATE_MODELS = ['gemini-3.5-flash-lite'];
/** Pauses between the rounds of the chain (so up to three attempts on each model). */
const RETRY_DELAYS_MS = [1_000, 3_000];
/** Chain entries of another provider carry this prefix (`external:<model>`). */
const EXTERNAL_PREFIX = 'external:';
const DEFAULT_EXTERNAL_URL = 'https://api.openai.com/v1/chat/completions';
/** Fewer foreign words than this (and under TRIVIAL_FOREIGN_SHARE of the clip) cost no request. */
const DEFAULT_MIN_FOREIGN_WORDS = 3;
const TRIVIAL_FOREIGN_SHARE = 0.5;
const SENTENCE_END = /[.!?…][»”’"')\]]*$/u;
const SENTENCE_GAP_SECONDS = 1.0;
const MIN_WORD_SECONDS = 0.1;
const VOWELS = /[аеёиоуыэюяaeiouyàèéìòùäöü]/giu;

export type TranslationSummary = {
    sentences: number;
    foreign: number;
    translated: number;
    languages: string[];
    /** Words of the foreign sentences and of the whole clip. */
    foreignWords: number;
    totalWords: number;
    /** The language the transcriber reported for most words, when it reported any. */
    dominantLanguage?: string;
    /** True when a translation request was really sent. */
    requested: boolean;
    /** Why no request was sent. */
    skipped?: 'no-foreign-speech' | 'too-little-foreign-speech';
};

type Script = 'cyrillic' | 'latin' | 'other';

function scriptOf(letter: string): Script {
    if (/\p{Script=Cyrillic}/u.test(letter)) return 'cyrillic';
    if (/\p{Script=Latin}/u.test(letter)) return 'latin';

    return 'other';
}

/** Dominant script of the words, or undefined for digits/punctuation only. */
function dominantScript(words: WordTiming[]): Script | undefined {
    const counts: Record<Script, number> = { cyrillic: 0, latin: 0, other: 0 };

    for (const word of words) {
        for (const letter of word.text.match(/\p{L}/gu) ?? []) {
            counts[scriptOf(letter)] += 1;
        }
    }

    const total = counts.cyrillic + counts.latin + counts.other;

    if (total === 0) return undefined;

    const best = (Object.keys(counts) as Script[])
        .sort((a, b) => counts[b] - counts[a])[0]!;

    return counts[best] / total >= 0.6 ? best : undefined;
}

function baseLanguage(language: string | undefined): string | undefined {
    return language?.trim().toLowerCase().split(/[-_]/u)[0] || undefined;
}

/** Pure: the language label most words carry (`en-US` and `en` count as `en`). */
export function dominantLanguage(words: WordTiming[]): string | undefined {
    const counts = new Map<string, number>();

    for (const word of words) {
        const language = baseLanguage(word.language);
        if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Pure: REEL_SUBTITLE_TRANSLATE_MIN_WORDS, a whole number from 1 (default 3). */
export function minForeignWords(env: NodeJS.ProcessEnv = process.env): number {
    const value = Number(env.REEL_SUBTITLE_TRANSLATE_MIN_WORDS);

    return Number.isInteger(value) && value >= 1 ? value : DEFAULT_MIN_FOREIGN_WORDS;
}

/**
 * Pure: a clip that is almost entirely in the target language and carries only
 * a word or two of another one ("OK", a brand, "wow") is not translated: the
 * request would cost more than the caption is worth. A clip that is mostly or
 * entirely foreign is always translated, however short.
 */
export function isTrivialForeignSpeech(
    foreignWords: number,
    totalWords: number,
    minWords: number,
): boolean {
    return foreignWords < minWords && foreignWords < totalWords * TRIVIAL_FOREIGN_SHARE;
}

function scriptOfLanguage(language: string): Script {
    return ['ru', 'uk', 'bg', 'be', 'sr', 'mk', 'kk'].includes(language)
        ? 'cyrillic'
        : ['zh', 'ja', 'ko', 'ar', 'he', 'hi', 'th', 'fa', 'el'].includes(language)
            ? 'other'
            : 'latin';
}

export type Sentence = { first: number; last: number };

/** Pure: sentence ranges of the transcript. */
export function splitSentences(words: WordTiming[]): Sentence[] {
    const sentences: Sentence[] = [];
    let first = 0;

    for (let index = 1; index <= words.length; index += 1) {
        const previous = words[index - 1]!;
        const next = words[index];

        if (
            next &&
            !SENTENCE_END.test(previous.text.trim()) &&
            next.start - previous.end <= SENTENCE_GAP_SECONDS &&
            next.speaker === previous.speaker
        ) {
            continue;
        }

        sentences.push({ first, last: index - 1 });
        first = index;
    }

    return sentences;
}

/** Pure: the label of a foreign sentence (language code or script), else undefined. */
export function foreignLabel(
    sentenceWords: WordTiming[],
    target: string,
): string | undefined {
    const targetBase = baseLanguage(target) ?? 'ru';
    const labelled = sentenceWords
        .map(word => baseLanguage(word.language))
        .filter((language): language is string => language !== undefined);

    // A label exists only when the transcriber really reported a language
    // per word (the module never fills in a default).
    if (labelled.length > 0) {
        const counts = new Map<string, number>();
        labelled.forEach(language => counts.set(language, (counts.get(language) ?? 0) + 1));
        const [language, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;

        if (language !== targetBase && count / labelled.length > 0.5) {
            return language;
        }

        if (language === targetBase && count / labelled.length > 0.5) {
            return undefined;
        }
    }

    const script = dominantScript(sentenceWords);

    if (script && script !== scriptOfLanguage(targetBase)) {
        return script === 'latin' ? 'latin' : 'other';
    }

    return undefined;
}

function syllables(text: string): number {
    const vowels = text.match(VOWELS)?.length ?? 0;
    const letters = text.match(/\p{L}/gu)?.length ?? 0;

    return vowels > 0 ? vowels : Math.max(0.4, letters / 3);
}

/**
 * Pure: puts translated text over the words of one sentence. Words are
 * spread over [first.start, last.end] by syllable weight (never shorter than
 * MIN_WORD_SECONDS, so a long translation extends up to `limitEnd`).
 */
export function layoutTranslation(
    source: WordTiming[],
    translated: string,
    sourceLanguage: string,
    limitEnd: number,
    targetLanguage: string,
): WordTiming[] {
    const tokens = translated.trim().split(/\s+/u).filter(Boolean);

    if (tokens.length === 0 || source.length === 0) return source;

    const start = source[0]!.start;
    const naturalEnd = source[source.length - 1]!.end;
    const weights = tokens.map(token => Math.max(0.4, syllables(token)));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const needed = tokens.length * MIN_WORD_SECONDS;
    const end = Math.max(naturalEnd, Math.min(limitEnd, start + needed));
    const span = Math.max(end - start, needed);
    let cursor = start;

    return tokens.map((token, index) => {
        const duration = Math.max(MIN_WORD_SECONDS, (span * weights[index]!) / totalWeight);
        const position = tokens.length > 1 ? index / (tokens.length - 1) : 0;
        const origin = source[Math.min(source.length - 1, Math.round(position * (source.length - 1)))]!;
        const word: WordTiming = {
            text: token,
            start: cursor,
            end: cursor + duration,
            language: targetLanguage,
            sourceLanguage,
            ...(origin.speaker ? { speaker: origin.speaker } : {}),
        };

        cursor += duration;

        return word;
    });
}

/** Translated text is data from a model: bounded and free of control characters. */
const MAX_TRANSLATION_CHARACTERS = 400;
const MAX_TRANSLATION_GROWTH = 5;

/**
 * Pure: a usable translation of `source`, or undefined when it looks wrong.
 * With a `target` in a non-Latin script (ru, uk, ...) the text must contain
 * letters of that script: a model that answers with the source line again
 * ("translated" English into English) has not translated anything.
 */
export function acceptTranslation(source: string, translated: string, target?: string): string | undefined {
    const text = stripControlCharacters(translated);

    if (!text || text.length > MAX_TRANSLATION_CHARACTERS) return undefined;
    // A translation many times longer than the line is an answer to something
    // else (an instruction hidden in the speech, an explanation, a refusal).
    if (text.length > Math.max(60, source.length * MAX_TRANSLATION_GROWTH)) return undefined;
    // Markup or code fences have no place in a caption.
    if (/[<>`]|^\s*[{\[]/u.test(text)) return undefined;

    const targetScript = target ? scriptOfLanguage(baseLanguage(target) ?? target) : 'latin';

    if (targetScript !== 'latin' && !(text.match(/\p{L}/gu) ?? []).some(letter => scriptOf(letter) === targetScript)) {
        return undefined;
    }

    return text;
}

/** The answer parsed, but not one of its lines is a usable translation: worth asking again. */
export class UnusableTranslationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnusableTranslationError';
    }
}

export function parseTranslations(raw: string, allowed: Map<number, string>, target?: string): Map<number, string> {
    const cleaned = raw
        .trim()
        .replace(/^```(?:json)?/iu, '')
        .replace(/```$/u, '')
        .trim();
    const parsed = JSON.parse(cleaned) as unknown;
    const list = Array.isArray(parsed)
        ? parsed
        : (parsed as { translations?: unknown }).translations;
    const result = new Map<number, string>();

    if (!Array.isArray(list)) return result;

    for (const item of list as Array<{ id?: unknown; text?: unknown }>) {
        if (typeof item?.id !== 'number' || typeof item.text !== 'string') continue;

        const source = allowed.get(item.id);
        if (source === undefined) continue;

        const accepted = acceptTranslation(source, item.text, target);
        if (accepted) result.set(item.id, accepted);
    }

    // Nothing usable in an answer to a non-empty question: another model may do better.
    if (result.size === 0 && allowed.size > 0) {
        throw new UnusableTranslationError('[SUBTITLE] The model answered without a usable translation');
    }

    return result;
}

const sleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

/**
 * Pure: a failure that is worth repeating: the service is overloaded or
 * unreachable for a moment, or the model answered with broken JSON.
 */
export function isTransientError(error: unknown): boolean {
    if (error instanceof SyntaxError || error instanceof UnusableTranslationError) return true;

    const message = error instanceof Error ? error.message : String(error);
    const record = error as { status?: unknown; code?: unknown } | undefined;
    const status = Number(record?.status ?? record?.code);

    if (TRANSIENT_STATUSES.has(status)) return true;

    return /"code"\s*:\s*(?:500|502|503|504)\b|\b(?:UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED)\b|high demand|overloaded|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/iu.test(message);
}

/** Pure: the model name is unknown to the API (a wrong name in the env). */
export function isModelNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: unknown } | undefined)?.status;

    return status === 404 || /"code"\s*:\s*404\b|\bNOT_FOUND\b/u.test(message);
}

export type ExternalProvider = { url: string; apiKey: string; model: string };

/**
 * Pure: the optional translator of another provider (see the header). It is
 * used only when both the key and the model are set and the URL is https, so a
 * half-filled setting never sends lines (or the key) anywhere.
 */
export function externalProvider(env: NodeJS.ProcessEnv = process.env): ExternalProvider | undefined {
    const apiKey = env.REEL_SUBTITLE_TRANSLATE_EXTERNAL_API_KEY?.trim();
    const model = env.REEL_SUBTITLE_TRANSLATE_EXTERNAL_MODEL?.trim();

    if (!apiKey || !model) return undefined;

    const url = env.REEL_SUBTITLE_TRANSLATE_EXTERNAL_URL?.trim() || DEFAULT_EXTERNAL_URL;

    try {
        if (new URL(url).protocol !== 'https:') return undefined;
    } catch {
        return undefined;
    }

    return { url, apiKey, model };
}

/** Pure: models to try in order; the main one first, without duplicates; another provider's model last. */
export function translateModels(env: NodeJS.ProcessEnv = process.env): string[] {
    const main = env.REEL_SUBTITLE_TRANSLATE_MODEL?.trim() || DEFAULT_TRANSLATE_MODEL;
    const raw = env.REEL_SUBTITLE_TRANSLATE_FALLBACK_MODEL;
    const fallbacks = raw === undefined
        ? DEFAULT_FALLBACK_TRANSLATE_MODELS
        : raw.split(',').map(name => name.trim()).filter(Boolean);
    const external = externalProvider(env);

    return [
        ...new Set([main, ...fallbacks.filter(name => !['none', 'off'].includes(name.toLowerCase()))]),
        ...(external ? [`${EXTERNAL_PREFIX}${external.model}`] : []),
    ];
}

/**
 * Runs `attempt` over the models in rounds: in each round every model gets one
 * attempt, in order, and the first success is returned. A failing model hands
 * over to the next one at once (an overloaded model answers 503 only after
 * about a minute, so waiting on it is the expensive part); the pause comes
 * after a whole round, and each pause adds one more round. A used-up quota is
 * treated like an outage; an unknown model is dropped for good; any other
 * failure (bad key, bad request) is thrown, since every model would fail the
 * same way, unless `skipModel` says this model alone is at fault (it is then
 * dropped). After the last round the last error is thrown.
 */
export async function generateWithFallback<T>(
    models: string[],
    attempt: (model: string) => Promise<T>,
    options: {
        delaysMs?: number[];
        wait?: (ms: number) => Promise<void>;
        label?: string;
        skipModel?: (model: string, error: unknown) => boolean;
    } = {},
): Promise<T> {
    const delays = options.delaysMs ?? RETRY_DELAYS_MS;
    const wait = options.wait ?? sleep;
    const label = options.label ?? 'Translation';
    const dropped = new Set<string>();
    let lastError: unknown;

    for (let round = 0; round <= delays.length; round += 1) {
        let tried = 0;

        for (const [modelIndex, model] of models.entries()) {
            if (dropped.has(model)) continue;

            tried += 1;

            try {
                const value = await attempt(model);

                if (modelIndex > 0 || round > 0) {
                    console.info(`[SUBTITLE] ${label} recovered`, {
                        model,
                        attempt: round + 1,
                        fallback: modelIndex > 0,
                    });
                }

                return value;
            } catch (error) {
                // The time budget of the subtitle step is used up: no repeat, no next model.
                if (isBudgetExceeded(error)) throw error;

                lastError = error;

                const reason = error instanceof Error ? error.message : String(error);
                const notFound = isModelNotFoundError(error);
                const outage = isRateLimitError(error) || isTransientError(error);
                const modelAtFault = notFound || (!outage && options.skipModel?.(model, error) === true);

                if (!outage && !modelAtFault) throw error;

                if (modelAtFault) dropped.add(model);

                console.warn(`[SUBTITLE] ${label} request failed`, {
                    model,
                    attempt: round + 1,
                    next: modelAtFault ? 'model dropped' : 'next model',
                    reason: reason.slice(0, 200),
                });
            }
        }

        const delay = delays[round];

        if (tried === 0 || delay === undefined) break;

        await wait(delay);
    }

    throw lastError;
}

/** Pure: the API refused the thinking setting of the request (the model does not take it). */
export function isThinkingRejected(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: unknown } | undefined)?.status;

    return (status === 400 || /"code"\s*:\s*400\b|INVALID_ARGUMENT/u.test(message))
        && /thinking/iu.test(message);
}

/** Models that refused the thinking setting: it is not sent to them again. */
const modelsWithoutThinking = new Set<string>();

/**
 * One request that must answer with JSON; returns the answer text. The model is
 * asked for little thinking (translating or checking short lines needs none,
 * and thinking is billed as output). A model that refuses the setting gets the
 * request once more without it and is not sent the setting again. Also used by
 * verify-transcript.ts, with audio parts in `contents`.
 */
export async function requestJson(
    ai: GoogleGenAI,
    model: string,
    contents: unknown,
    timeoutMs: number = requestTimeoutMs(),
): Promise<string> {
    // An overloaded model answers 503 only after about a minute, and a hung request
    // never answers: each request is limited, and none starts once the budget is used up.
    const send = (withThinking: boolean) => withinBudget(
        `Gemini request (${model})`,
        () => ai.models.generateContent({
            model,
            contents,
            config: {
                responseMimeType: 'application/json',
                temperature: 0.2,
                ...(withThinking ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {}),
            },
        } as never),
        timeoutMs,
    );
    let response: unknown;

    try {
        response = await send(!modelsWithoutThinking.has(model));
    } catch (error) {
        if (modelsWithoutThinking.has(model) || !isThinkingRejected(error)) throw error;

        modelsWithoutThinking.add(model);
        console.warn('[SUBTITLE] Model refused the thinking setting; asking without it.', { model });
        response = await send(false);
    }

    return (response as { text?: string }).text ?? '';
}

function translationPrompt(
    items: Array<{ id: number; text: string }>,
    target: string,
    answerShape: 'array' | 'object',
): string {
    return (
        `Translate each numbered line of speech from a video into the language "${target}" for subtitles. ` +
        'The source language of every line may differ (English, Italian, ...): detect it yourself. ' +
        'Keep the meaning, a natural spoken tone and roughly the same length; names stay as they are. ' +
        'Do not add notes. ' +
        (answerShape === 'array'
            ? 'Answer with JSON only: an array of {"id": number, "text": string}, one entry per input line.'
            : 'Answer with JSON only: an object {"translations": [{"id": number, "text": string}]}, one entry per input line.') +
        '\n\n' +
        JSON.stringify(items)
    );
}

/** One request to the optional translator of another provider (OpenAI-compatible chat completions). */
export async function requestExternalJson(
    provider: ExternalProvider,
    prompt: string,
    timeoutMs: number,
): Promise<string> {
    return withinBudget(`External request (${provider.model})`, async () => {
        const response = await fetch(provider.url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${provider.apiKey}`,
            },
            body: JSON.stringify({
                model: provider.model,
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: 'json_object' },
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await response.text();

        if (!response.ok) {
            // `status` lets isTransientError / isRateLimitError tell an outage from a bad key.
            throw Object.assign(
                new Error(`[SUBTITLE] External translation request failed: HTTP ${response.status} ${body.slice(0, 200)}`),
                { status: response.status },
            );
        }

        const content = (JSON.parse(body) as { choices?: Array<{ message?: { content?: unknown } }> })
            .choices?.[0]?.message?.content;

        return typeof content === 'string' ? content : '';
    }, timeoutMs);
}

async function requestTranslations(
    items: Array<{ id: number; text: string }>,
    target: string,
    apiKey: string,
): Promise<Map<number, string>> {
    const ai = new GoogleGenAI({ apiKey });
    const allowed = new Map(items.map(item => [item.id, item.text]));
    const external = externalProvider();
    const timeoutMs = translateRequestTimeoutMs();

    // Parsing is part of the attempt: broken JSON (or an answer with no usable
    // translation) is repeated like an outage.
    return generateWithFallback(
        translateModels(),
        async model => {
            if (external && model === `${EXTERNAL_PREFIX}${external.model}`) {
                return parseTranslations(
                    await requestExternalJson(external, translationPrompt(items, target, 'object'), timeoutMs),
                    allowed,
                    target,
                );
            }

            return parseTranslations(
                await requestJson(ai, model, translationPrompt(items, target, 'array'), timeoutMs),
                allowed,
                target,
            );
        },
        // A wrong key or request for the other provider must not stop the Gemini models.
        { skipModel: model => model.startsWith(EXTERNAL_PREFIX) },
    );
}

/**
 * Pure: true when translateForeignSpeech would send a request for these words
 * (foreign sentences that are not a stray word or two). The pipeline uses it
 * to keep time back for the translation only when there is something to translate.
 */
export function needsTranslation(words: WordTiming[], target: string): boolean {
    if (words.length === 0) return false;

    let foreignWords = 0;

    for (const sentence of splitSentences(words)) {
        const sentenceWords = words.slice(sentence.first, sentence.last + 1);

        if (foreignLabel(sentenceWords, target)) foreignWords += sentenceWords.length;
    }

    return foreignWords > 0 && !isTrivialForeignSpeech(foreignWords, words.length, minForeignWords());
}

/**
 * Translates foreign sentences of the transcript into `target`. Pure apart
 * from the single Gemini request (injectable for tests).
 */
export async function translateForeignSpeech(
    transcript: WhisperTranscript,
    target: string,
    translate: (
        items: Array<{ id: number; text: string }>,
        target: string,
    ) => Promise<Map<number, string>> = (items, language) => {
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

        return requestTranslations(items, language, apiKey);
    },
): Promise<{ transcript: WhisperTranscript; summary: TranslationSummary }> {
    assertLanguageCode(target);

    const words = transcript.words;
    const sentences = splitSentences(words);
    const foreign: Array<{ id: number; sentence: Sentence; label: string }> = [];

    sentences.forEach((sentence, index) => {
        const label = foreignLabel(words.slice(sentence.first, sentence.last + 1), target);
        if (label) foreign.push({ id: index, sentence, label });
    });

    const foreignWords = foreign.reduce(
        (sum, item) => sum + item.sentence.last - item.sentence.first + 1,
        0,
    );
    const summary: TranslationSummary = {
        sentences: sentences.length,
        foreign: foreign.length,
        translated: 0,
        languages: [...new Set(foreign.map(item => item.label))],
        foreignWords,
        totalWords: words.length,
        ...(dominantLanguage(words) ? { dominantLanguage: dominantLanguage(words)! } : {}),
        requested: false,
    };

    if (foreign.length === 0) {
        return { transcript, summary: { ...summary, skipped: 'no-foreign-speech' } };
    }

    if (isTrivialForeignSpeech(foreignWords, words.length, minForeignWords())) {
        return { transcript, summary: { ...summary, skipped: 'too-little-foreign-speech' } };
    }

    summary.requested = true;

    const translations = await translate(
        foreign.map(item => ({
            id: item.id,
            text: words
                .slice(item.sentence.first, item.sentence.last + 1)
                .map(word => word.text)
                .join(' '),
        })),
        target,
    );

    const result: WordTiming[] = [];
    let cursor = 0;

    for (const item of foreign) {
        result.push(...words.slice(cursor, item.sentence.first));
        const source = words.slice(item.sentence.first, item.sentence.last + 1);
        const translated = translations.get(item.id);

        if (translated) {
            const nextStart = words[item.sentence.last + 1]?.start;
            const limit = nextStart !== undefined
                ? Math.max(source.at(-1)!.end, nextStart - 0.05)
                : source.at(-1)!.end + 1;
            const sourceLanguage = baseLanguage(source[0]?.language) ?? item.label;

            result.push(...layoutTranslation(source, translated, sourceLanguage, limit, baseLanguage(target) ?? target));
            summary.translated += 1;
        } else {
            result.push(...source);
        }

        cursor = item.sentence.last + 1;
    }

    result.push(...words.slice(cursor));

    return { transcript: { ...transcript, words: result }, summary };
}

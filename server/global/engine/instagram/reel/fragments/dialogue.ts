import ffmpegPath from 'ffmpeg-static'
import type {WordTiming} from '#server/global/engine/instagram/reel/subtitle/types'
import {transcribeInstagramTranscriptWithGemini} from '#server/global/engine/instagram/reel/subtitle/transcription/gemini'

/**
 * Сюжетная разметка исходника нарезки (запрос владельца 12.11: фрагменты обрывались
 * посреди диалога — «договорила фразу, и сразу конец, хотя разговор продолжается»).
 *
 * Расшифровка речи (Gemini Transcribe: слова с таймингами и говорящими) складывается в:
 * - реплики — законченные предложения одного говорящего (знак конца предложения, смена
 *   говорящего или пауза);
 * - блоки диалога — подряд идущие реплики с паузами короче BLOCK_GAP_SECONDS: пока
 *   собеседники отвечают друг другу, разговор не закончен.
 * Конец блока — место, где фрагмент можно закончить; надёжнее всего, если после него
 * долгая пауза или склейка (смена плана или места).
 */

export type DialogueLine = {
    start: number
    end: number
    speaker?: string
    text: string
    /** Реплика закончена знаком конца предложения (. ? ! …). */
    complete: boolean
}

export type DialogueBlock = {
    start: number
    end: number
    /** Индексы первой и последней реплики блока. */
    firstLine: number
    lastLine: number
    /** Тишина после блока до следующей речи (или до конца ролика), секунды. */
    gapAfter: number
}

export type Dialogue = {
    lines: DialogueLine[]
    blocks: DialogueBlock[]
}

/** Пауза внутри одной реплики, после которой реплика всё равно делится. */
const LINE_GAP_SECONDS = 0.9
/** Пауза между репликами, после которой разговор считается законченным. */
const BLOCK_GAP_SECONDS = 4.5
const SENTENCE_END = /[.?!…»"]$/

export const buildDialogue = (words: WordTiming[], duration: number): Dialogue => {
    const sorted = words
        .filter(word => word.text.trim() && Number.isFinite(word.start) && Number.isFinite(word.end))
        .sort((a, b) => a.start - b.start)

    const lines: DialogueLine[] = []
    let current: {words: WordTiming[]} | null = null

    const flush = () => {
        if (!current?.words.length) return
        const first = current.words[0]!
        const last = current.words[current.words.length - 1]!
        const text = current.words.map(word => word.text.trim()).join(' ').replace(/\s+([,.?!…:;])/g, '$1')
        lines.push({
            start: first.start,
            end: last.end,
            ...(first.speaker ? {speaker: first.speaker} : {}),
            text,
            complete: SENTENCE_END.test(text)
        })
        current = null
    }

    for (const word of sorted) {
        if (current) {
            const previous = current.words[current.words.length - 1]!
            const speakerChanged = Boolean(word.speaker && previous.speaker && word.speaker !== previous.speaker)
            if (speakerChanged || word.start - previous.end >= LINE_GAP_SECONDS || SENTENCE_END.test(previous.text.trim())) {
                flush()
            }
        }
        current ??= {words: []}
        current.words.push(word)
    }
    flush()

    const blocks: DialogueBlock[] = []
    lines.forEach((line, index) => {
        const last = blocks[blocks.length - 1]
        if (last && line.start - last.end < BLOCK_GAP_SECONDS) {
            last.end = Math.max(last.end, line.end)
            last.lastLine = index
        } else {
            blocks.push({start: line.start, end: line.end, firstLine: index, lastLine: index, gapAfter: 0})
        }
    })
    blocks.forEach((block, index) => {
        const next = blocks[index + 1]
        block.gapAfter = (next ? next.start : duration) - block.end
    })

    return {lines, blocks}
}

/** Слова всего исходника (Gemini Transcribe); сбой — null (фрагменты выбираются без текста). */
export const transcribeSourceWords = async (sourcePath: string): Promise<WordTiming[] | null> => {
    try {
        const transcript = await transcribeInstagramTranscriptWithGemini({
            inputPath: sourcePath,
            ...(ffmpegPath ? {ffmpegPath: ffmpegPath as unknown as string} : {}),
            timeoutMs: 10 * 60_000
        })
        return transcript.words
    } catch (error) {
        console.warn('[REEL FRAGMENTS] Transcription failed; choosing fragments without dialogue', {
            message: error instanceof Error ? error.message : String(error)
        })
        return null
    }
}

const clock = (seconds: number) => seconds.toFixed(1)

/** Реплики в виде строк для промпта: «[12.4–15.8] S1: текст». */
export const formatLines = (lines: DialogueLine[], from = 0, to = Number.POSITIVE_INFINITY): string =>
    lines
        .filter(line => line.end > from && line.start < to)
        .map(line => `[${clock(line.start)}–${clock(line.end)}] ${line.speaker ?? '—'}: ${line.text}`)
        .join('\n')

/** Где разговор закончен: конец блока и пауза после него. */
export const formatBlockEnds = (blocks: DialogueBlock[]): string =>
    blocks
        .map(block => `${clock(block.end)} (тишина ${block.gapAfter.toFixed(1)} с)`)
        .join(', ')

/** Реплика, внутри которой стоит момент time (с запасом в четверть секунды), или undefined. */
export const lineAt = (lines: DialogueLine[], time: number): DialogueLine | undefined =>
    lines.find(line => time > line.start + 0.25 && time < line.end - 0.25)

/** Блок, внутри которого (между первой и последней репликой) стоит момент time. */
export const blockAt = (blocks: DialogueBlock[], time: number): DialogueBlock | undefined =>
    blocks.find(block => time > block.start + 0.25 && time < block.end - 0.25)

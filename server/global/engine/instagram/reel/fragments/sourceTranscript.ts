import os from 'node:os'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {readFile, rm, writeFile} from 'node:fs/promises'
import type {WordTiming} from '#server/global/engine/instagram/reel/subtitle/types'
import {
    downloadR2ObjectToFile,
    reelR2Paths,
    type ReelContent
} from '#server/global/engine/instagram/reel/pipeline/reelWorkspace'
import {freshR2Url} from '#server/global/engine/instagram/reel/pipeline/cleanVideo'
import {
    existsInCloudflareR2,
    getCloudflareR2Url,
    storageCloudflareR2
} from '#server/global/engine/instagram/reel/utils/storageCloudflareR2'

/**
 * Расшифровка всего исходника нарезки (запрос владельца 12.11): Gemini Transcribe
 * проходит ролик один раз, на шаге выбора фрагментов. Слова (время от начала исходника)
 * лежат в R2 рядом с исходником (`temp/{…}_transcript.json`) и живут столько же:
 * - повторный выбор фрагментов (сбой воркера, повтор задачи) не расшифровывает заново;
 * - субтитры финального ролика берут слова выбранного фрагмента отсюда, а не отправляют
 *   clean в Gemini второй раз (остальные шаги субтитров — тайминг Whisper, проверка,
 *   перевод, говорящие — идут как обычно, по clean).
 */

const VERSION = 1

type StoredTranscript = {version: number, durationSeconds: number, words: WordTiming[]}

export const saveSourceTranscript = async (
    content: Pick<ReelContent, 'id' | 'type'>,
    keyTrailer: string,
    words: WordTiming[],
    durationSeconds: number
): Promise<void> => {
    const local = path.join(os.tmpdir(), `${randomUUID()}_transcript.json`)
    try {
        const body: StoredTranscript = {version: VERSION, durationSeconds, words}
        await writeFile(local, JSON.stringify(body), 'utf8')
        await storageCloudflareR2(local, reelR2Paths(content, keyTrailer).transcript, 'application/json')
        console.log('[REEL TRANSCRIPT SAVED]', {words: words.length})
    } catch (error) {
        // Не сохранилось — субтитры просто расшифруют clean сами.
        console.warn('[REEL TRANSCRIPT SAVE FAILED]', {message: error instanceof Error ? error.message : String(error)})
    } finally {
        await rm(local, {force: true})
    }
}

/** Сохранённая расшифровка исходника или null (нет, повреждена, сбой чтения). */
export const loadSourceTranscript = async (
    content: Pick<ReelContent, 'id' | 'type'>,
    keyTrailer: string
): Promise<StoredTranscript | null> => {
    const key = reelR2Paths(content, keyTrailer).transcript
    const local = path.join(os.tmpdir(), `${randomUUID()}_transcript.json`)
    try {
        if (!(await existsInCloudflareR2(key))) return null
        await downloadR2ObjectToFile(freshR2Url(getCloudflareR2Url(key)), local)
        const parsed = JSON.parse(await readFile(local, 'utf8')) as StoredTranscript
        if (parsed?.version !== VERSION || !Array.isArray(parsed.words)) return null
        return parsed
    } catch (error) {
        console.warn('[REEL TRANSCRIPT LOAD FAILED]', {message: error instanceof Error ? error.message : String(error)})
        return null
    } finally {
        await rm(local, {force: true})
    }
}

/**
 * Слова фрагмента во времени clean (clean начинается ровно с начала фрагмента): только
 * слова целиком внутри фрагмента (с запасом 0,15 с на округление склейки).
 */
export const wordsForSegment = (
    words: WordTiming[],
    segment: {startSeconds: number, endSeconds: number}
): WordTiming[] => {
    const slack = 0.15
    return words
        .filter(word => word.start >= segment.startSeconds - slack && word.end <= segment.endSeconds + slack)
        .map(word => ({
            ...word,
            start: Math.max(0, word.start - segment.startSeconds),
            end: Math.max(0, Math.min(segment.endSeconds, word.end) - segment.startSeconds)
        }))
}

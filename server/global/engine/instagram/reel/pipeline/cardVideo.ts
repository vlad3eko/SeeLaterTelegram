import {unlink} from 'node:fs/promises'
import {downloadTrailer} from '#server/global/engine/instagram/reel/utils/downloadTrailer'
import {prepareTelegramVideo} from '#server/global/engine/instagram/reel/utils/prepareTelegramVideo'
import {storageCloudflareR2} from '#server/global/engine/instagram/reel/utils/storageCloudflareR2'
import {reelR2Paths, type ReelContent} from '#server/global/engine/instagram/reel/pipeline/reelWorkspace'

/**
 * Трейлер для шапки поста в канале (решение владельца 22.11): воркер скачивает его в формате для
 * Telegram (H.264 + AAC, до 45 МБ — как «Загрузка трейлера») и кладёт в R2 (`reelR2Paths().cardVideo`).
 * Финализатор загружает файл в канал-хранилище, запоминает file_id и удаляет файл из R2.
 *
 * Сбой — не ошибка задачи: пост выйдет с широким кадром или постером, Reel собирается как обычно.
 */
export const prepareCardVideo = async (content: Pick<ReelContent, 'id' | 'type'>, keyTrailer: string): Promise<boolean> => {
    let trailerPath: string | undefined
    let telegramPath: string | undefined
    try {
        trailerPath = await downloadTrailer(keyTrailer, {forTelegram: true})
        telegramPath = await prepareTelegramVideo(trailerPath)
        await storageCloudflareR2(telegramPath, reelR2Paths(content, keyTrailer).cardVideo)
        console.log('[CARD VIDEO READY]', {keyTrailer})
        return true
    } catch (error) {
        console.warn('[CARD VIDEO SKIPPED]', {keyTrailer, message: error instanceof Error ? error.message.split('\n')[0] : String(error)})
        return false
    } finally {
        if (trailerPath) await unlink(trailerPath).catch(() => undefined)
        if (telegramPath && telegramPath !== trailerPath) await unlink(telegramPath).catch(() => undefined)
    }
}

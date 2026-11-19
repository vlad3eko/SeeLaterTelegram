import {randomUUID} from 'node:crypto'
import {unlink} from 'node:fs/promises'
import process from 'node:process'
import {downloadTrailer} from '../../../server/global/engine/instagram/reel/utils/downloadTrailer'
import {prepareTelegramVideo} from '../../../server/global/engine/instagram/reel/utils/prepareTelegramVideo'
import {storageCloudflareR2} from '../../../server/global/engine/instagram/reel/utils/storageCloudflareR2'

/**
 * Запуск «Загрузка трейлера» (server/global/engine/instagram/reel/jobs/trailerDelivery.ts):
 * скачать трейлер для Telegram (не выше 1080p, H.264 + AAC), ужать до лимита Telegram, положить
 * во временную папку R2 и сообщить боту ссылку. Сбой — тоже сообщение боту: админ узнает в чате.
 */

const removeQuietly = (filePath?: string) => filePath ? unlink(filePath).catch(() => undefined) : undefined

export const isTrailerDeliveryRun = () => Boolean(process.env['TRAILER_KEY']?.trim())

export const runTrailerDelivery = async (): Promise<void> => {
    const keyTrailer = process.env['TRAILER_KEY']!.trim()
    const callbackUrl = process.env['TRAILER_CALLBACK_URL']?.trim()
    const base = {
        keyTrailer,
        chatId: Number(process.env['TRAILER_CHAT_ID']),
        expires: Number(process.env['TRAILER_EXPIRES']),
        token: process.env['TRAILER_CALLBACK_TOKEN']
    }
    if (!callbackUrl || !base.chatId || !base.token) throw new Error('[TRAILER DELIVERY] callback env is missing')

    let trailerPath: string | undefined
    let telegramPath: string | undefined
    let result: {videoUrl: string} | {error: string}
    try {
        trailerPath = await downloadTrailer(keyTrailer, {forTelegram: true})
        telegramPath = await prepareTelegramVideo(trailerPath)
        const videoUrl = await storageCloudflareR2(telegramPath, `instagram/reels/temp/trailer_${keyTrailer}_${randomUUID()}.mp4`)
        result = {videoUrl}
        console.log('[TRAILER DELIVERY READY]', {keyTrailer, videoUrl})
    } catch (error) {
        console.error('[TRAILER DELIVERY FAILED]', {keyTrailer, error})
        result = {error: error instanceof Error ? error.message.slice(0, 500) : String(error)}
    } finally {
        await removeQuietly(trailerPath)
        if (telegramPath !== trailerPath) await removeQuietly(telegramPath)
    }

    // Бот мог быть недоступен секунды (холодный старт Vercel) — три попытки; ответ 4xx не повторяется.
    let lastError = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(callbackUrl, {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify({...base, ...result}),
                signal: AbortSignal.timeout(280_000)
            })
            if (response.ok) return
            lastError = `HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
            if (response.status < 500) break
        } catch (error) {
            lastError = String(error)
        }
        console.error('[TRAILER DELIVERY CALLBACK RETRY]', {attempt, lastError})
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 5_000))
    }
    throw new Error(`[TRAILER DELIVERY CALLBACK] ${lastError}`)
}

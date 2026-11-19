import {createHmac, timingSafeEqual} from 'node:crypto'
import {runReelWorker} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'

/**
 * «Загрузка трейлера» админ-бота (решение владельца 19.11.2026: тяжёлое — не на Vercel).
 *
 * Vercel только запускает воркер Cloud Run с ключом трейлера и чатом. Воркер скачивает трейлер
 * (yt-dlp + bgutil уже в его образе), ужимает до лимита Telegram, кладёт во временную папку R2 и
 * присылает ссылку на /api/bot/trailerDelivery. Бот пересылает файл в чат потоком (без
 * перекодирования и без записи на диск) и удаляет его из R2.
 *
 * Подпись обратного вызова — HMAC от токена бота: новых секретов не нужно, а подделать ответ без
 * токена нельзя. Срок жизни подписи — час (воркер укладывается в минуты).
 */

const PURPOSE = 'kinomanov:trailer-delivery:v1'
const TOKEN_TTL_MS = 60 * 60 * 1000

export type TrailerDeliveryRequest = {keyTrailer: string, chatId: number, expires: number}

export const trailerDeliveryToken = ({keyTrailer, chatId, expires}: TrailerDeliveryRequest, secret: string) =>
    createHmac('sha256', secret).update(`${PURPOSE}:${keyTrailer}:${chatId}:${expires}`).digest('hex')

export const verifyTrailerDelivery = (request: TrailerDeliveryRequest & {token: unknown}, secret: string, now = Date.now()) => {
    if (typeof request.token !== 'string' || !(request.expires > now)) return false
    const expected = Buffer.from(trailerDeliveryToken(request, secret))
    const received = Buffer.from(request.token)
    return received.length === expected.length && timingSafeEqual(received, expected)
}

/** Запустить воркер; ответ придёт на {baseUrl}/api/bot/trailerDelivery. */
export const dispatchTrailerDelivery = async (
    {keyTrailer, chatId, baseUrl, secret}: {keyTrailer: string, chatId: number, baseUrl: string, secret: string}
) => {
    const request = {keyTrailer, chatId, expires: Date.now() + TOKEN_TTL_MS}
    return runReelWorker({
        TRAILER_KEY: keyTrailer,
        TRAILER_CHAT_ID: String(chatId),
        TRAILER_EXPIRES: String(request.expires),
        TRAILER_CALLBACK_URL: `${baseUrl.replace(/\/$/, '')}/api/bot/trailerDelivery`,
        TRAILER_CALLBACK_TOKEN: trailerDeliveryToken(request, secret)
    })
}


import {createHmac, timingSafeEqual} from 'node:crypto'
import {bot} from "#server/bot/bot";

// Telegram присылает этот заголовок, если вебхук зарегистрирован с secret_token.
const SECRET_HEADER = 'x-telegram-bot-api-secret-token'

// Секрет выводится из токена бота (HMAC), поэтому новых переменных окружения не нужно.
// Тот же вывод использует scripts/setTelegramWebhook.mjs при регистрации вебхука.
// Необязательное переопределение: TELEGRAM_WEBHOOK_SECRET.
const SECRET_PURPOSE = 'kinomanov:telegram-webhook:v1'

let warnedAboutMissingSecret = false

const resolveExpectedSecret = (): string | null => {
    const explicit = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
    if (explicit) return explicit

    const token = process.env.TELEGRAM_TOKEN?.trim()
    if (!token) return null

    return createHmac('sha256', token).update(SECRET_PURPOSE).digest('hex')
}

const secretMatches = (received: string | undefined, expected: string): boolean => {
    if (!received) return false

    const receivedBuffer = Buffer.from(received)
    const expectedBuffer = Buffer.from(expected)

    return receivedBuffer.length === expectedBuffer.length &&
        timingSafeEqual(receivedBuffer, expectedBuffer)
}

// В dev бот работает через polling и вебхук не используется.
// Аварийный выключатель: TELEGRAM_WEBHOOK_SECRET_ENFORCE=off на Vercel возвращает приём без проверки.
const isEnforced = (): boolean =>
    process.env.NODE_ENV !== 'development' &&
    process.env.TELEGRAM_WEBHOOK_SECRET_ENFORCE?.trim().toLowerCase() !== 'off'

export default defineEventHandler(async (event) => {

    const expectedSecret = resolveExpectedSecret()

    if (expectedSecret && isEnforced()) {
        if (!secretMatches(getHeader(event, SECRET_HEADER), expectedSecret)) {
            throw createError({statusCode: 401, statusMessage: 'Unauthorized'})
        }
    } else if (!warnedAboutMissingSecret) {
        warnedAboutMissingSecret = true
        console.warn('[WEBHOOK] secret check is disabled: updates are accepted without authentication')
    }

    const body = await readBody(event)
    try {
        await bot.handleUpdate(body)
        return { ok: true }
    } catch (err: any) {
        console.error('Telegram webhook error:', err)
        return { ok: false }
    }
})

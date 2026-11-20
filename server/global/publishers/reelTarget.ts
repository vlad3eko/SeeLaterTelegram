import type {Telegram} from 'telegraf'

/**
 * Куда уходит готовый Reel.
 *
 * - `telegram_manual` — основной бот по умолчанию (решение владельца 20.11.2026): новый аккаунт Instagram
 *   набирает просмотры только с ручных публикаций, а API-публикации привели к проверке аккаунта в Meta.
 *   Весь цикл тот же (воркер, субтитры, кадрирование, пост в канал), но готовый ролик и подпись
 *   Instagram приходят администратору в чат бота — загрузить вручную с телефона.
 * - `instagram` — публикация через Graph API; включается переменной REEL_TARGET=instagram.
 * - `telegram_preview` — dev-бот (npm run dev, NODE_ENV=development): то же, что ручной режим, с пометкой
 *   «Dev»; в Instagram из dev ничего не уходит независимо от REEL_TARGET.
 */
export type ReelTarget = 'instagram' | 'telegram_manual' | 'telegram_preview'

export const reelTarget = (env: NodeJS.ProcessEnv = process.env): ReelTarget =>
    env.NODE_ENV === 'development'
        ? 'telegram_preview'
        : env.REEL_TARGET?.trim() === 'instagram' ? 'instagram' : 'telegram_manual'

/** Telegram принимает видео файлом до 50 МБ; больше — ролик приходит ссылкой. */
const TELEGRAM_UPLOAD_LIMIT = 50 * 1024 * 1024
/** Подпись к видео в Telegram — до 1024 символов, у Instagram до 2200: подпись идёт отдельным сообщением. */
const TELEGRAM_TEXT_LIMIT = 4096

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Подпись блоком кода: в Telegram у него кнопка «Копировать» — удобно вставить в Instagram с телефона. */
export const reelCaptionMessage = (caption: string): string => {
    const head = `<b>Подпись для Instagram</b> (${caption.length} симв.) — нажмите «Копировать»:\n`
    // Запас под разметку и экранирование; подпись Instagram (до 2200) в лимит помещается.
    let body = caption
    while (head.length + escapeHtml(body).length + 30 > TELEGRAM_TEXT_LIMIT) body = body.slice(0, -100)
    return `${head}<pre>${escapeHtml(body)}${body.length < caption.length ? '…' : ''}</pre>`
}

/**
 * Готовый Reel (тот же файл, что ушёл бы в Instagram) — видео в чат администратора, следом подпись
 * Instagram отдельным сообщением. Видео скачивается и загружается файлом: по ссылке Telegram берёт
 * только до 20 МБ. Файл в R2 остаётся, поэтому запасной вариант — ссылка.
 */
export const sendReelPreview = async (
    telegram: Telegram,
    {chatId, videoUrl, caption, title, dev = false}: {chatId: number, videoUrl: string, caption: string, title?: string, dev?: boolean}
): Promise<void> => {
    const name = title ? ` «${title}»` : ''
    const heading = dev
        ? `🧪 Dev: Reel${name} — в Instagram не отправлен. Так он уйдёт из основного бота.`
        : `📲 Reel${name} готов — загрузите его в Instagram вручную. Подпись — следующим сообщением.`

    let video: Buffer | undefined
    try {
        const response = await fetch(videoUrl, {signal: AbortSignal.timeout(120_000)})
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const size = Number(response.headers.get('content-length') || 0)
        if (size && size > TELEGRAM_UPLOAD_LIMIT) throw new Error(`file is ${Math.round(size / 1048576)} MB`)
        video = Buffer.from(await response.arrayBuffer())
        if (video.length > TELEGRAM_UPLOAD_LIMIT) throw new Error(`file is ${Math.round(video.length / 1048576)} MB`)
    } catch (error: any) {
        console.warn('[REEL PREVIEW DOWNLOAD SKIPPED]', error?.message || error)
        video = undefined
    }

    if (video) {
        await telegram.sendVideo(chatId, {source: video, filename: 'reel.mp4'}, {
            caption: heading,
            supports_streaming: true
        })
    } else {
        await telegram.sendMessage(chatId, `${heading}\n\nВидео: ${videoUrl}`)
    }

    await telegram.sendMessage(chatId, reelCaptionMessage(caption), {parse_mode: 'HTML'})
}

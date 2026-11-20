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
/** Подпись к видео в Telegram — до 1024 символов (подписи Instagram у нас 100–470), сообщение — до 4096. */
const TELEGRAM_CAPTION_LIMIT = 1024
const TELEGRAM_TEXT_LIMIT = 4096

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Заголовок сообщения с роликом. */
export const reelHeading = (title: string | undefined, dev: boolean): string => {
    const name = title ? ` «${title}»` : ''
    return dev
        ? `🧪 Dev: Reel${name} — в Instagram не отправлен. Так он уйдёт из основного бота.`
        : `📲 Reel${name} — загрузите в Instagram. Подпись — нажмите, чтобы скопировать:`
}

/**
 * Заголовок и подпись Instagram блоком кода (в Telegram у него кнопка «Копировать» — удобно
 * вставить в Instagram с телефона). Не влезает в limit (считаются буквы без разметки, как у
 * Telegram) — undefined.
 */
export const reelCaptionHtml = (heading: string, caption: string, limit: number): string | undefined =>
    heading.length + 1 + caption.length <= limit
        ? `${escapeHtml(heading)}\n<pre>${escapeHtml(caption)}</pre>`
        : undefined

/** Подпись отдельным сообщением — только если вместе с роликом она не влезает (длиннее ~950 символов). */
export const reelCaptionMessage = (caption: string): string => {
    const head = `<b>Подпись для Instagram</b> (${caption.length} симв.) — нажмите «Копировать»:\n`
    // Запас под разметку и экранирование; подпись Instagram (до 2200) в лимит помещается.
    let body = caption
    while (head.length + escapeHtml(body).length + 30 > TELEGRAM_TEXT_LIMIT) body = body.slice(0, -100)
    return `${head}<pre>${escapeHtml(body)}${body.length < caption.length ? '…' : ''}</pre>`
}

/**
 * Готовый Reel (тот же файл, что ушёл бы в Instagram) — одним сообщением в чат администратора:
 * видео, под ним подпись Instagram блоком «Копировать» (решение владельца 20.11). Видео скачивается
 * и загружается файлом: по ссылке Telegram берёт только до 20 МБ. Файл в R2 остаётся, поэтому
 * запасной вариант — ссылка. Подпись длиннее лимита подписи к видео — вторым сообщением.
 */
export const sendReelPreview = async (
    telegram: Telegram,
    {chatId, videoUrl, caption, title, dev = false}: {chatId: number, videoUrl: string, caption: string, title?: string, dev?: boolean}
): Promise<void> => {
    const heading = reelHeading(title, dev)

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
        const together = reelCaptionHtml(heading, caption, TELEGRAM_CAPTION_LIMIT)
        await telegram.sendVideo(chatId, {source: video, filename: 'reel.mp4'}, {
            caption: together ?? escapeHtml(heading),
            parse_mode: 'HTML',
            supports_streaming: true
        })
        if (!together) await telegram.sendMessage(chatId, reelCaptionMessage(caption), {parse_mode: 'HTML'})
        return
    }

    // Видео не скачалось или больше 50 МБ: ссылка и подпись тоже одним сообщением.
    const linkHeading = `${heading.replace(/:$/, '.')}\nВидео: ${videoUrl}\nПодпись:`
    const together = reelCaptionHtml(linkHeading, caption, TELEGRAM_TEXT_LIMIT)
    if (together) {
        await telegram.sendMessage(chatId, together, {parse_mode: 'HTML'})
    } else {
        await telegram.sendMessage(chatId, escapeHtml(`${heading}\nВидео: ${videoUrl}`), {parse_mode: 'HTML'})
        await telegram.sendMessage(chatId, reelCaptionMessage(caption), {parse_mode: 'HTML'})
    }
}

import type {Telegram} from 'telegraf'

/**
 * Куда уходит готовый Reel (решение владельца 19.11.2026).
 *
 * - Основной бот (production): публикация по назначению — в Instagram (в будущем и в другие сети).
 * - Dev-бот (npm run dev, NODE_ENV=development): весь цикл тот же (воркер, проверка, пост в тестовый
 *   канал), но вместо Instagram готовый ролик и подпись приходят администратору в чат бота —
 *   посмотреть, проверить, отладить. В Instagram из dev ничего не уходит.
 */
export type ReelTarget = 'instagram' | 'telegram_preview'

export const reelTarget = (env: NodeJS.ProcessEnv = process.env): ReelTarget =>
    env.NODE_ENV === 'development' ? 'telegram_preview' : 'instagram'

/** Telegram принимает видео файлом до 50 МБ; больше — ролик приходит ссылкой. */
const TELEGRAM_UPLOAD_LIMIT = 50 * 1024 * 1024
/** Подпись к видео в Telegram — до 1024 символов, у Instagram до 2200: подпись идёт отдельным сообщением. */
const TELEGRAM_TEXT_LIMIT = 4096

/**
 * Dev: готовый Reel (тот же файл, что ушёл бы в Instagram) — видео в чат администратора,
 * следом подпись Instagram отдельным сообщением. Видео скачивается и загружается файлом:
 * по ссылке Telegram берёт только до 20 МБ.
 */
export const sendReelPreview = async (
    telegram: Telegram,
    {chatId, videoUrl, caption, title}: {chatId: number, videoUrl: string, caption: string, title?: string}
): Promise<void> => {
    const heading = `🧪 Dev: Reel${title ? ` «${title}»` : ''} — в Instagram не отправлен. Так он уйдёт из основного бота.`

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

    const text = `Подпись Instagram (${caption.length} симв.):\n\n${caption}`
    await telegram.sendMessage(chatId, text.length > TELEGRAM_TEXT_LIMIT ? `${text.slice(0, TELEGRAM_TEXT_LIMIT - 1)}…` : text)
}

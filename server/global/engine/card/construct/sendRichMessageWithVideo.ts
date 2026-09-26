import {readFile} from 'node:fs/promises'

export const sendRichMessageWithVideo = async (
    ctx: any,
    chatId: string | number,
    richMessage: any,
    videoPath: string,
    replyMarkup?: any
) => {

    const token =
        process.env.NODE_ENV === 'production'
            ? process.env.TELEGRAM_TOKEN
            : process.env.TELEGRAM_DEV_TOKEN

    if (!token) {
        throw new Error(
            'Telegram bot token is not configured'
        )
    }

    const videoBuffer =
        await readFile(
            videoPath
        )

    const form =
        new FormData()

    form.append(
        'chat_id',
        String(chatId)
    )

    form.append(
        'rich_message',
        JSON.stringify(
            richMessage
        )
    )

    if (replyMarkup) {

        form.append(
            'reply_markup',
            JSON.stringify(
                replyMarkup
            )
        )
    }

    form.append(
        'rich_video',
        new Blob(
            [
                videoBuffer
            ],
            {
                type: 'video/mp4'
            }
        ),
        'rich_video.mp4'
    )

    const response =
        await fetch(
            `https://api.telegram.org/bot${token}/sendRichMessage`,
            {
                method: 'POST',
                body: form
            }
        )

    const result =
        await response.json()

    if (!result.ok) {

        throw new Error(
            `Telegram sendRichMessage error: ${
                result.description ||
                'Unknown error'
            }`
        )
    }

    return result.result
}

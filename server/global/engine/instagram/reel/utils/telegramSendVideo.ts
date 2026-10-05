import { Input } from 'telegraf'
import { unlink } from 'node:fs/promises'
import { prepareTelegramVideo } from "./prepareTelegramVideo"

export const telegramSendVideo = async (ctx: any, inputPath: string) => {
    let telegramPath = inputPath
    try {
        telegramPath = await prepareTelegramVideo(inputPath)
        console.log('[TELEGRAM SEND VIDEO]', telegramPath)
        const sendVideo = await ctx.telegram.sendVideo(
            ctx.chat.id,
            Input.fromLocalFile(telegramPath),
            { supports_streaming: true }
        )
        const telegramFileId = sendVideo.video?.file_id

        if (!telegramFileId) {
            await ctx.reply('Telegram did not return video file_id')
            throw new Error('Telegram did not return video file_id')
        }

        return telegramFileId

    } finally {
        if (telegramPath !== inputPath) {
            try {
                await unlink(telegramPath)
                console.log('[TELEGRAM TEMP DELETE]', telegramPath)
            } catch (error: any) {
                if (error?.code !== 'ENOENT') {
                    console.error('[TELEGRAM TEMP DELETE ERROR]', telegramPath, error)
                }
            }
        }
    }
}

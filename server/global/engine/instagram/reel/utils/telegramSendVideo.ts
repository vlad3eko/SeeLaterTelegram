import {Input} from "telegraf";

export const telegramSendVideo = async (ctx: any, normalizePath: any) => {
    const sendVideo =
        await ctx.telegram.sendVideo(
            ctx.chat.id,
            Input.fromLocalFile(
                normalizePath
            ),
        )

    const telegramFileId =
        sendVideo.video?.file_id

    if (!telegramFileId) {

        await ctx.reply(
            'Telegram did not return video file_id'
        )

        throw new Error(
            'Telegram did not return video file_id'
        )
    }

    return telegramFileId

}

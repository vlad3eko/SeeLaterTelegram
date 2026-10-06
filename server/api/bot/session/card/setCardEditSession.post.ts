import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const supabase = await serverSupabaseClient(event)
    const body = await readBody(event)

    const {data: user, error: userError} = await supabase
        .from('users')
        .select("id")
        .eq('telegram_id', body.telegram_id)
        .single()

    if (userError || !user) {
        throw createError({
            statusCode: 404,
            message: "Пользователь не найден editAddSessionMessage"
        })
    }

    await supabase
        .from('card_edit_session')
        .update({
            "inlineMessageId": body.data.inlineMessageId,
            "chatId": body.data.chatId,
            "messageId": body.data.messageId,
            "mediaId": body.data.mediaId,
            "mediaType": body.data.mediaType,
            "media": body.data.media,
            "contentType": body.data.contentType,
            "keyTrailer": body.data.keyTrailer,
            "comment":body.data.comment,
            "overview": body.data.overview,
            "mode": body.data.mode,
            "preparedInstagram": {
                "keyTrailer": body.data.keyTrailer,
                "reelR2": body.data.reelR2,
                "telegramFileId": body.data.telegramFileId,
            },
            "currentMedia": {
                "type": body.data.type,
                "fileId": body.data.fileId,
            },
        })
        .eq('user_id', user)

})

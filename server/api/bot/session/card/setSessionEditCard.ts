import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const supabase = await serverSupabaseClient(event)
    const body = await readBody(event)

    const telegramId = body?.telegram_id
    const data = body?.data

    if (!telegramId || !data)
        throw createError({statusCode: 400, message: 'telegram_id or data invalid [setSessionEditCard.post]'})

    const {data: user, error: userError} = await supabase
        .from('users')
        .select("id")
        .eq('telegram_id', telegramId)
        .single()

    if (userError || !user)
        throw createError({statusCode: 404, message: "Пользователь не найден [setSessionEditCard.post]"})

    const {error} = await supabase
        .from('admin_edit_sessions')
        .upsert(
            {
                user_id: user.id,

                inline_message_id: data.inlineMessageId ?? null,
                chat_id: data.chatId != null
                    ? String(data.chatId)
                    : null,
                message_id: data.messageId ?? null,

                media_id: data.mediaId,
                media_type: data.mediaType,

                media: data.media,

                content_type: data.contentType,

                key_trailer: data.keyTrailer ?? null,
                comment: data.comment ?? null,
                overview: data.overview ?? null,

                mode: data.mode ?? null,

                prepared_instagram: data.preparedInstagram
                    ? {
                        keyTrailer: data.preparedInstagram.keyTrailer,
                        reelR2: data.preparedInstagram.reelR2,
                        telegramFileId: data.preparedInstagram.telegramFileId ?? null
                    }
                    : null,

                current_media: data.currentMedia
            },
            {
                onConflict: 'user_id'
            }
        )

    if (error)
        throw createError({statusCode: 400, message: `Ошибка сохранения сессии: ${error.message} [setSessionEditCard.post]`})

    return {
        success: true
    }
})

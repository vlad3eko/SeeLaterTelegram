import {serverSupabaseClient} from "#supabase/server";
import type {AdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export default defineEventHandler(async (event) => {

    const supabase = await serverSupabaseClient(event)
    const query = getQuery(event)

    const telegramId = query.telegram_id

    if (!telegramId)
        throw createError({statusCode: 400, message: 'telegram_id or data invalid [getSessionEditCard]'})

    const {data: user, error: userError} = await supabase
        .from('users')
        .select("id")
        .eq('telegram_id', telegramId)
        .single()

    if (userError || !user)
        throw createError({statusCode: 404, message: "Пользователь не найден [getSessionEditCard]"})


    const {data: row, error} = await supabase
        .from('card_edit_session')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

    if (error)
        throw createError({statusCode: 500, statusMessage: error.message})

    if (!row)
        return null

    const session: AdminEditSession = {
        inlineMessageId: row.inline_message_id ?? undefined,
        chatId: row.chat_id ?? undefined,
        messageId: row.message_id ?? undefined,
        mediaId: row.media_id,
        mediaType: row.media_type,
        media: row.media,
        contentType: row.content_type,
        keyTrailer: row.key_trailer ?? undefined,
        comment: row.comment ?? undefined,
        overview: row.overview ?? undefined,
        mode: row.mode ?? undefined,
        preparedInstagram: row.prepared_instagram
            ? {
                keyTrailer: row.prepared_instagram.keyTrailer,
                reelR2: row.prepared_instagram.reelR2,
                telegramFileId:
                    row.prepared_instagram.telegramFileId ?? undefined
            }
            : undefined,
        currentMedia: row.current_media
    }

    return session
})

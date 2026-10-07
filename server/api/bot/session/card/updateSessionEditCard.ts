import {serverSupabaseServiceRole} from "#supabase/server"

export default defineEventHandler(async (event) => {

    const supabase = serverSupabaseServiceRole(event)
    const body = await readBody(event)

    const telegramId = body?.telegram_id
    const data = body?.data

    if (!telegramId || !data) {
        throw createError({
            statusCode: 400,
            message: "telegram_id и data обязательны"
        })
    }

    const {data: user, error: userError} = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegramId)
        .single()

    if (userError || !user) {
        throw createError({
            statusCode: 404,
            message: "Пользователь не найден"
        })
    }

    const update: Record<string, any> = {}

    if ('inlineMessageId' in data)
        update.inline_message_id = data.inlineMessageId ?? null

    if ('chatId' in data)
        update.chat_id =
            data.chatId != null
                ? String(data.chatId)
                : null

    if ('messageId' in data)
        update.message_id = data.messageId ?? null

    if ('mediaId' in data)
        update.media_id = data.mediaId

    if ('mediaType' in data)
        update.media_type = data.mediaType

    if ('media' in data)
        update.media = data.media

    if ('contentType' in data)
        update.content_type = data.contentType

    if ('keyTrailer' in data)
        update.key_trailer = data.keyTrailer ?? null

    if ('comment' in data)
        update.comment = data.comment ?? null

    if ('overview' in data)
        update.overview = data.overview ?? null

    if ('mode' in data)
        update.mode = data.mode ?? null

    if ('preparedInstagram' in data)
        update.prepared_instagram =
            data.preparedInstagram ?? null

    if ('currentMedia' in data)
        update.current_media = data.currentMedia

    if (Object.keys(update).length === 0) {
        throw createError({
            statusCode: 400,
            message: "Нет данных для обновления"
        })
    }

    update.updated_at = new Date().toISOString()

    const {error} = await supabase
        .from('card_edit_sessions')
        .update(update)
        .eq('user_id', user.id)

    if (error) {
        throw createError({
            statusCode: 500,
            message: `Ошибка обновления сессии: ${error.message}`
        })
    }

    return {
        success: true
    }
})

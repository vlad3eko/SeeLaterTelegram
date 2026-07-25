import {
    serverSupabaseClient
} from "#supabase/server";


export default defineEventHandler(async (event) => {

    const body =
        await readBody(event)


    const supabase =
        await serverSupabaseClient(event)


    const {
        error
    } =
        await supabase
            .from('published_media_messages')
            .upsert(
                {
                    telegram_chat_id:
                    body.telegramChatId,

                    telegram_message_id:
                    body.telegramMessageId,

                    media_id:
                    body.mediaId,

                    media_type:
                    body.mediaType,

                    content_type:
                    body.contentType,

                    keyboard_version:
                    body.keyboardVersion
                },
                {
                    onConflict:
                        'telegram_chat_id,telegram_message_id'
                }
            )


    if (error) {

        throw createError({
            statusCode: 500,
            statusMessage: error.message
        })
    }


    return {
        success: true
    }
})

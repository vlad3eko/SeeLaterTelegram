
import {
    serverSupabaseServiceRole
} from "#supabase/server";


export default defineEventHandler(async (event) => {

    const body =
        await readBody(event)


    const supabase =
        serverSupabaseServiceRole(event) as any


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
                    body.keyboardVersion,

                    key_trailer:
                    body.keyTrailer ?? null,

                    is_rich_type_card:
                    body.isRichTypeCard === true
                },
                {
                    onConflict:
                        'telegram_chat_id,telegram_message_id'
                }
            )


    if (error) {

        throw createError({
            status: 500,
            message: error.message
        })
    }


    return {
        success: true
    }
})

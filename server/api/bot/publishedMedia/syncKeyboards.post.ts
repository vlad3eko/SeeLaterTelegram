
import {
    keyboardSendMediaCardInline
} from "#server/bot/consts/buttons/keyboardBot";

import {
    serverSupabaseServiceRole
} from "#supabase/server";

import {
    bot
} from "#server/bot/bot";

import {
    CURRENT_KEYBOARD_VERSION
} from "#server/bot/consts/keyboardVersion/keyboardVersion";
import {getMediaSaveCount} from "#server/bot/consts/keyboardVersion/getMediaSaveCount";


const SETTLED_ERRORS = [
    'Bad Request: message is not modified',
    'Bad Request: message to edit not found',
    'Bad Request: MESSAGE_ID_INVALID'
]

export default defineEventHandler(async (event) => {

    const supabase =
        serverSupabaseServiceRole(event) as any


    const {
        data: posts,
        error
    } =
        await supabase
            .from('published_media_messages')
            .select('*')
            .lt(
                'keyboard_version',
                CURRENT_KEYBOARD_VERSION
            )


    if (error) {

        throw createError({
            status: 500,
            message: error.message
        })
    }


    let updated = 0
    let failed = 0

    const markSynced = (id: number) => supabase
        .from('published_media_messages')
        .update({keyboard_version: CURRENT_KEYBOARD_VERSION, updated_at: new Date().toISOString()})
        .eq('id', id)

    for (const post of posts ?? []) {
        try {
            await bot.telegram.editMessageReplyMarkup(
                post.telegram_chat_id,
                post.telegram_message_id,
                undefined,
                keyboardSendMediaCardInline(
                    post.media_id,
                    post.media_type,
                    post.content_type,
                    false,
                    'channel',
                    await getMediaSaveCount(post.media_id),
                    post.key_trailer,
                    post.is_rich_type_card
                )
            )
            await markSynced(post.id)
            updated++
        } catch (error: any) {
            // Клавиатура уже такая или поста больше нет: повторять незачем, иначе пост
            // перебирается при каждой публикации.
            if (SETTLED_ERRORS.includes(error?.response?.description)) {
                await markSynced(post.id)
            } else {
                failed++
                console.error(error)
            }
        }
    }


    return {
        success: true,
        updated,
        failed
    }
})

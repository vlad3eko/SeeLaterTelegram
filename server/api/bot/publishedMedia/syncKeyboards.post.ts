import {
    keyboardSendMediaCardInline
} from "#server/bot/consts/buttons/keyboardBot";

import {
    serverSupabaseClient
} from "#supabase/server";

import {
    bot
} from "#server/bot/bot";

import {
    CURRENT_KEYBOARD_VERSION
} from "#server/bot/consts/keyboardVersion/keyboardVersion";


export default defineEventHandler(async (event) => {

    const supabase =
        await serverSupabaseClient(event)


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
            statusCode: 500,
            statusMessage: error.message
        })
    }


    let updated = 0
    let failed = 0


    for (const post of posts ?? []) {

        try {

            const media =
                await $fetch(
                    '/api/bot/getMediaBot',
                    {
                        query: {
                            id:
                            post.media_id,

                            media:
                            post.media_type
                        }
                    }
                )


            const saveCount =
                await $fetch<number>(
                    '/api/bot/library/getFavoriteCount',
                    {
                        query: {
                            tmdbId:
                            post.media_id
                        }
                    }
                )


            const replyMarkup =
                keyboardSendMediaCardInline(
                    post.media_id,
                    post.media_type,
                    post.content_type,
                    media.genres,
                    false,
                    'channel',
                    saveCount
                )

            await bot.telegram.editMessageReplyMarkup(
                post.telegram_chat_id,
                post.telegram_message_id,
                undefined,
                replyMarkup
            )


            const {
                error:
                    updateError
            } =
                await supabase
                    .from('published_media_messages')
                    .update(
                        {
                            keyboard_version:
                            CURRENT_KEYBOARD_VERSION,

                            updated_at:
                                new Date().toISOString()
                        }
                    )
                    .eq(
                        'id',
                        post.id
                    )


            if (updateError) {

                throw updateError
            }


            updated++


        } catch (error) {

            failed++


            console.error(
                '[KEYBOARD SYNC ERROR]',
                {
                    postId:
                    post.id,

                    messageId:
                    post.telegram_message_id,

                    error
                }
            )
        }
    }


    return {
        success: true,
        updated,
        failed
    }
})

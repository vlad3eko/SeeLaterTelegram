import {
    keyboardSendMediaCardInline
} from "#server/bot/consts/buttons/keyboardBot"

import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption"
import {isAdmin} from "#server/bot/consts/admins"
import {tmdbFetch} from "#server/utils/api/tmdbFetch";


export const chosenInlineMedia = async (ctx: any) => {

    console.log('chosen Inline')
    try {
        const result = ctx.update.chosen_inline_result
        const inlineMessageId = result?.inline_message_id

        if (!inlineMessageId) return
        if (result.result_id === 'no_search_results' || result.result_id === 'empty_collection') return

        const [_, mediaType, contentType, mediaId
        ] = result.result_id.split('_')


        const media = await tmdbFetch(
            '/api/bot/getMediaBot',
            {
                query: {
                    media: mediaType,
                    id: mediaId
                }
            }
        )

        console.log('media', media)

        const admin = isAdmin(result.from.id)
        await ctx.telegram.editMessageMedia(undefined, undefined, inlineMessageId,
            {
                type: 'photo',
                media:
                    `https://image.tmdb.org/t/p/w500${
                        media.poster_path ||
                        media.backdrop_path
                    }`,
                caption:
                        createMediaCaption(
                        media,
                        contentType
                    ),
                parse_mode: 'HTML'
            },
            {
                reply_markup:
                    keyboardSendMediaCardInline(
                        mediaId,
                        mediaType,
                        contentType,
                        media.genres,
                        admin
                    )
            }
        )

    } catch (e) {

        console.log(
            'chosenInlineMedia error:',
            e
        )

    }

}

import {commandClear} from "#server/bot/commands/commandClear";
import {removeMessageSession} from "#server/bot/services/session/removeMessageSession";
import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const saveMedia = async (ctx: any) => {

    const isUserBot =
        await checkChannelSubscriber(ctx)

    if (isUserBot) {
        await ctx.answerCbQuery('✅ Добавлено в вашу коллекцию')
    } else {
        await ctx.answerCbQuery('❌ Подпишитесь на 🏷Киноманов BOT')
        return
    }

    const userId = ctx.from.id

    const mediaId = Number(
        ctx.match[1]
    )

    const mediaType = ctx.match[2]

    const media = await $fetch(
        '/api/bot/getMediaBot',
        {
                query: {

                    id:
                    mediaId,

                    media:
                    mediaType
                }
            }
        )

    const mediaTitle = media.title || media.name

    const voteAverage = media.vote_average || 0

    const voteCount = media.vote_count || 0

    const mediaPoster = media.poster_path || media.backdrop_path

    const releaseDate = media.release_date || media.first_air_date


    const {success} = await $fetch<{
        success: boolean
        error: any
    }>(
        '/api/bot/saveMediaBot',
        {
                method: 'POST',
                body: {
                    userId,
                    mediaTitle,
                    mediaId,
                    mediaType,
                    mediaPoster,
                    voteAverage,
                    voteCount,
                    releaseDate
                }
            }
        )

    if (!success) {
        return
    }

    const saveCount = await $fetch<number>(
        '/api/bot/library/getFavoriteCount',
        {
                query: {

                    tmdbId:
                    media.id
                }
            }
        )

    const publishedMedia = await $fetch(
        '/api/bot/publishedMedia/getByMedia',
            {
                query: {

                    mediaId,

                    mediaType
                }
            }
        )

    await removeMessageSession(ctx.from.id, {
            inlineMessageId:
            ctx.inlineMessageId
        }
    )

    if (publishedMedia) {
        await ctx.editMessageReplyMarkup(
            keyboardSendMediaCardInline(
                mediaId,
                mediaType,
                publishedMedia.contentType,
                media.genres,
                false,
                "channel",
                saveCount
            )
        )
    }

    console.log('[saveMedia]', publishedMedia.contentType)

    await commandClear(ctx)

}

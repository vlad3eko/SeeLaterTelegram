import {commandClear} from "#server/bot/commands/commandClear";
import {removeMessageSession} from "#server/bot/services/session/removeMessageSession";
import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {tmdbFetch} from "#server/utils/api/tmdbFetch";
import {
    NOTIFICATION_MESSAGE,
    sendNotificationTelegramMessage
} from "#server/global/notifications/sendNotificationMessage";

export const saveMedia = async (ctx: any) => {

    const isUserBot =
        await checkChannelSubscriber(ctx)



    if (!isUserBot)
        return await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorOnlyForSubscriber)



    const userId = ctx.from.id

    const mediaId = Number(
        ctx.match[1]
    )

    const mediaType = ctx.match[2]

    const media = await tmdbFetch(
        '/api/tmdb/media',
        {
                query: {
                    id: mediaId,
                    media: mediaType
                }
            }
        )

    const mediaTitle = media.title || media.name
    const voteAverage = media.vote_average || 0
    const voteCount = media.vote_count || 0
    const mediaPoster = media.poster_path || media.backdrop_path
    const releaseDate = media.release_date || media.first_air_date
    const genresIds = media.genres

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
                    releaseDate,
                    genresIds
                }
            }
        )



    if (!success)
        return await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorAlreadyExist)



    await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.SuccessSaved)

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
        try {
            await ctx.editMessageReplyMarkup(
                keyboardSendMediaCardInline(
                    mediaId,
                    mediaType,
                    publishedMedia.content_type,
                    media.genres,
                    false,
                    'channel',
                    saveCount
                )
            )
        } catch (error: any) {
            const errorMessage =
                error?.response?.description
            if (errorMessage !== 'Bad Request: message is not modified') {
                return
            }
        }
    }

    await commandClear(ctx)
    await sendNotificationTelegramMessage(userId, NOTIFICATION_MESSAGE.SuccessSaved, {mediaId, mediaType})
}

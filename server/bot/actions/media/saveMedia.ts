import {isSubscriber} from "#server/bot/handlers/channel/isSubscriber";
import {keyboardSavedMediaCardBot} from "#server/bot/consts/buttons/keyboardBot";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";

export const saveMedia = async (ctx: any) => {

    await ctx.answerCbQuery('Сохранение...')

    await isSubscriber(ctx)

    const userId = ctx.from.id

    const mediaId = Number(ctx.match[1])
    const mediaType = ctx.match[2]

    const media = await $fetch(
        '/api/bot/getMediaBot',
        {
            query:{
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


    const {success, error} = await $fetch<{
        success: boolean,
        error: any
    }>(
        '/api/bot/saveMediaBot',
        {
            method:'POST',
            body:{
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


    if(!success){

        await ctx.answerCbQuery(
            `❌ ${error?.message?.includes('duplicate')
                ? 'Фильм уже сохранён'
                : 'Ошибка сохранения'
            }`,
            {
                show_alert:true
            }
        )

        return
    }


    await ctx.editMessageCaption(
        createMediaCaption(
            media,
            true,
            mediaType
        ),
        {
            parse_mode:'HTML',
            reply_markup: keyboardSavedMediaCardBot(mediaId, mediaType)
        }
    )

    /*await commandClear()*/
}

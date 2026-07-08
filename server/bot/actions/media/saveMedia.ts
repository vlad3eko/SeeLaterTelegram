import {isSubscriber} from "#server/bot/handlers/channel/isSubscriber";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {commandClear} from "#server/bot/commands/commandClear";
import {keyboardSavedMediaCardBot, keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";
import {removeMessageSession} from "#server/bot/services/session/removeMessageSession";

export const saveMedia = async (ctx: any) => {

    await ctx.answerCbQuery('сохранение...')

    await isSubscriber(ctx)

    const userId = ctx.from.id
    const mediaId = Number(ctx.match[2])
    const mediaType = ctx.match[3]

    const media = await $fetch(
        '/api/bot/getMediaBot',
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

    const {success, error} = await $fetch<{
        success: boolean,
        error: any
    }>('/api/bot/saveMediaBot', {
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
        }
    })

    if (!success) {

        if (error?.message.includes('duplicate key value')) {

            const errorMessage = await ctx.reply(
                `❌ Ой: вы уже сохраняли - «${mediaTitle}»`, {
                    reply_markup: keyboardSearchBot(ctx, '')
                }
            )

            await addMessageSession(
                ctx.from.id,
                errorMessage.message_id,
                SessionMessageType.Error
            )
            return
        } else {
            const errorMessage = await ctx.reply(
                `❌ Неизвестная ошибка: ${error?.errorMessage} \n\nПопробуйте позже, или свяжитесь со мной`
            )
            await addMessageSession(
                ctx.from.id,
                errorMessage.message_id,
                SessionMessageType.Error
            )
            return
        }
    }

    const successSave = await ctx.editMessageCaption(
        createMediaCaption(media, true, mediaType),
        {
            parse_mode: 'HTML',
            reply_markup: keyboardSavedMediaCardBot(media)
        }
    )

    if (successSave?.message_id) {
        await removeMessageSession(ctx.from.id, successSave.message_id)
    }

    await commandClear(ctx)
}

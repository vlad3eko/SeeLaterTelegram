import {Markup} from "telegraf";
import {isSubscriber} from "#server/bot/handlers/channel/isSubscriber";
import {deleteMessages} from "#server/bot/actions/delete/deleteMessages";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {saveMessageSession} from "#server/bot/services/session/saveMessageSession";

export const saveMedia = async (ctx: any) => {

    const ok = await ctx.reply('сохранение...')

    await isSubscriber(ctx)

    const userId = Number(ctx.match[1])
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

            await deleteMessages(ctx, [0, -1])


            await ctx.deleteMessage()

            const message = await ctx.reply(
                `❌ Ой: вы уже сохраняли - ${media.title || media.name}`,
                Markup.inlineKeyboard([
                    Markup.button.callback(
                        'Искать другое',
                        'search_media'
                    )
                ])
            )
            await addMessageSession(
                ctx.from.id,
                message.message_id
            )
            return
        } else {
            const message = await ctx.reply(
                `❌ Неизвестная ошибка: ${error?.message} \n\nПопробуйте позже, или свяжитесь со мной`
            )
            await addMessageSession(
                ctx.from.id,
                message.message_id
            )
            return
        }
    }

    await deleteMessages(ctx, [-1, -2])

   const successSave = await ctx.editMessageCaption(
        createMediaCaption(media, true, mediaType),
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🗑 Удалить из коллекции',
                            callback_data: `delete_media_${media.id}`
                        }
                    ],
                    [
                        {
                            text: 'Искать ещё',
                            callback_data: `search_media:keep`
                        }
                    ]
                ]
            }
        }
    )
    if (successSave) {
        await deleteMessages(ctx, [1])
    }
    await saveMessageSession(ctx.from.id, successSave.message_id)
}

import {Markup} from "telegraf";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";

export const saveMedia = async (ctx: any, authRequests: Map<string, number>) => {

    const isChannelMember = await processTelegramAuth(ctx, authRequests)

    if (!isChannelMember) {
        return false
    }

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

    const {success, error} = await $fetch('/api/bot/saveMediaBot', {
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

            await ctx.reply(
                `❌ Ой: вы уже сохраняли - ${media.title || media.name}`
            )
            return
        } else {
            await ctx.reply(
                `❌ Неизвестная ошибка: ${error?.message} \n\nПопробуйте позже, или свяжитесь со мной`
            )
            return
        }
    }

    await ctx.reply(
        `✅ ${mediaTitle} сохранён`,
        Markup.inlineKeyboard([
            Markup.button.callback(
                'Искать ещё',
                'add_media'
            )
        ])
    )

    const currentId = ctx.message.message_id;

    await ctx.telegram.deleteMessages(ctx.chat.id, [
        currentId - 1,  // сообщение выше
        currentId - 2   // сообщение еще выше
    ]);
}

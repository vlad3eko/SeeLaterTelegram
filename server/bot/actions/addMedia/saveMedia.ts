import {Markup} from "telegraf";
import {isSubscriber} from "#server/bot/handlers/channel/isSubscriber";

export const saveMedia = async (ctx: any) => {

    await ctx.answerCbQuery()
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

            await ctx.reply(
                `❌ Ой: вы уже сохраняли - ${media.title || media.name}`,
                Markup.inlineKeyboard([
                    Markup.button.callback(
                        'Очистить историю чата',
                        'delete_all_20'
                    )
                ])
            )
            return
        } else {
            await ctx.reply(
                `❌ Неизвестная ошибка: ${error?.message} \n\nПопробуйте позже, или свяжитесь со мной`
            )
            return
        }
    }

    if (!ctx.callbackQuery || !ctx.callbackQuery.message) {
        console.log('Не удалось получить ID сообщения для удаления');
        return;
    }

    // 3. Берем ID сообщения, НА КОТОРОМ была нажата кнопка «Сохранить»
    const currentButtonMessageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.chat?.id;

    if (!chatId) return;

    try {
        // 4. Удаляем сообщение с кнопкой сохранения и одно сообщение НАД ним
        await ctx.telegram.deleteMessages(chatId, [
            currentButtonMessageId - 1,
            currentButtonMessageId - 2
        ]);
    } catch (err) {
        console.log('Не удалось удалить старые сообщения:', err);
    }

    await ctx.reply(
        `✅ ${mediaTitle} сохранён`,
        Markup.inlineKeyboard([
            Markup.button.callback(
                'Искать ещё',
                'search_media'
            )
        ])
    )
}

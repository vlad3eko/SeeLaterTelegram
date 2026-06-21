import {addMediaState} from "#server/bot/consts/addMedia/addMediaState";
import {addMovie} from "#server/bot/actions/addMedia";

export const processMovieSearch = async (ctx: any, bot: any) => {

    addMediaState.set(
        ctx.from.id,
        {
            waitingMovie: true
        }
    )

    await ctx.answerCbQuery()

    await ctx.reply(
        'Введите название:',
    )

    bot.on(
        'text',
        addMovie
    )

}

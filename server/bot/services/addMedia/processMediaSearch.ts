import {addMediaState} from "#server/bot/consts/addMedia/addMediaState";
import {addMovie} from "#server/bot/actions/addMedia";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";

export const processMediaSearch = async (ctx: any) => {

    await ctx.answerCbQuery()

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
}

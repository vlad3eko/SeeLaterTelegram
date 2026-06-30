import {addMediaState} from "#server/bot/consts/addMedia/addMediaState";
import {addMovie} from "#server/bot/actions/addMedia";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";

export const processMediaSearch = async (ctx: any, authRequests: any) => {

    await ctx.answerCbQuery()
    const isAuthorized  = await processTelegramAuth(ctx, authRequests, false)

    if (!isAuthorized) {
        return
    }

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

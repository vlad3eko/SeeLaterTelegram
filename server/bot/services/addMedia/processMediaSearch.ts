import {addMediaState} from "#server/bot/consts/addMedia/addMediaState";
import {addMovie} from "#server/bot/actions/addMedia";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";

export const processMediaSearch = async (ctx: any, bot: any, authRequests: any) => {

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
    await ctx.editMessageText('Введите название:')

}

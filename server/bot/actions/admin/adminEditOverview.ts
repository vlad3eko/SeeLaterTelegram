import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const adminEditOverview = async (ctx: any) => {

    const session =
        getAdminEditSession(ctx.from.id)

    console.log('session [ADMIN EDIT OVERVIEW]', true)

    if (!session) {
        await ctx.answerCbQuery('Сессия не найдена')
        return
    }

    session.mode = 'overview'

    console.log('EDIT OVERVIEW MODE: ', session.mode)

    await ctx.answerCbQuery()

}

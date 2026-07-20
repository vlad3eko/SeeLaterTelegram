import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const adminEditText = async (ctx: any) => {

    const session = getAdminEditSession(ctx.from.id)

    if (!session) return

    session.mode = 'text'

    await ctx.answerCbQuery()

    await ctx.reply(
        'Редактирование текста'
    )
}

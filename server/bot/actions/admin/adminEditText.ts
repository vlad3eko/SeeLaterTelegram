import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const adminEditText = async (ctx: any) => {

    const session =
        getAdminEditSession(ctx.from.id)

    console.log(
        'EDIT TEXT SESSION:',
        session
    )

    if (!session) {
        await ctx.answerCbQuery(
            'Сессия не найдена'
        )

        return
    }

    session.mode = 'text'

    console.log(
        'EDIT TEXT MODE:',
        session.mode
    )

    await ctx.answerCbQuery()
}

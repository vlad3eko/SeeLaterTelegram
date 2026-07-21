import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const adminEditText = async (ctx: any) => {
        const session =
            getAdminEditSession(ctx.from.id)

        if (!session) {
            await ctx.answerCbQuery()
            return
        }

        session.mode = 'text'

        await ctx.reply(
            'Пришли новый текст.'
        )

        await ctx.answerCbQuery()
}

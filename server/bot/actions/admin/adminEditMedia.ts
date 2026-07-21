import {getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const adminEditMedia = async (ctx:any) => {
        const session =
            getAdminEditSession(ctx.from.id)

        if (!session) {
            await ctx.answerCbQuery()
            return
        }

        session.mode = 'media'

        await ctx.answerCbQuery()

        await ctx.reply(
            'Пришли новую фотографию или видео.'
        )
}

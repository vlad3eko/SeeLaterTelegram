import {clearAdminEditSession, getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";

export const adminEditActionInlineMessage = async (ctx: any) => {

        const session =
            getAdminEditSession(ctx.from.id)

        if(!session)
            return

        if(session.mode==="media"){
            if(!ctx.message.photo)
                return

            const photo =
                ctx.message.photo.at(-1)

            await ctx.telegram.editMessageMedia(
                undefined,
                undefined,
                session.inlineMessageId,
                {
                    type:"photo",
                    media:photo.file_id
                }
            )
        }

        if(session.mode==="text"){
            const text =
                ctx.message.text

            await ctx.telegram.editMessageCaption(
                undefined,
                undefined,
                session.inlineMessageId,
                {
                    caption:text,
                    parse_mode:"HTML"
                }
            )
        }

        clearAdminEditSession(ctx.from.id)
}

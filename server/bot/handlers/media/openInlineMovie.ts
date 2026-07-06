import {sendMediaCard} from "#server/bot/consts/media/sendMediaCard";

export const openInlineMovie = async (ctx: any) => {

    await ctx.answerCbQuery()

    const [, id, mediaType] =
        ctx.message.text.split("_")

    await sendMediaCard(ctx, id, mediaType)
}

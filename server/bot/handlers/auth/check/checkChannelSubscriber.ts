export const checkChannelSubscriber = async (ctx: any) => {
    const channelMember = await ctx.telegram.getChatMember(
        '@Zerno_Kopeica',
        ctx.from.id
    )

    return [
        'member',
        'administrator',
        'creator'
    ].includes(channelMember.status)
}

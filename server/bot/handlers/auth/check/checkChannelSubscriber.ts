export const checkChannelSubscriber = async (ctx: any) => {
    const channelMember = await ctx.telegram.getChatMember(
        '@bezkino_bot',
        ctx.from.id
    )

    return [
        'member',
        'administrator',
        'creator'
    ].includes(channelMember.status)
}

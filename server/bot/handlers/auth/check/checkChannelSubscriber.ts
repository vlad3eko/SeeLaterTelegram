export const checkChannelSubscriber = async (ctx: any) => {
    const channelMember = await ctx.telegram.getChatMember(
        '@bezkino_bot',
        ctx.from.id
    )

    const isMember = [
        'member',
        'administrator',
        'creator'
    ].includes(channelMember.status)

    if (!isMember) return false
    return isMember
}

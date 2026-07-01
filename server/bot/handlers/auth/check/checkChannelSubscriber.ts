export const checkChannelSubscriber = async (ctx: any) => {
    const channelMember = await ctx.telegram.getChatMember(
        '@kinomanovnet',
        ctx.from.id
    )

    const member = [
        'member',
        'administrator',
        'creator'
    ].includes(channelMember.status)
    console.log('member', member)

    return [
        'member',
        'administrator',
        'creator'
    ].includes(channelMember.status)
}

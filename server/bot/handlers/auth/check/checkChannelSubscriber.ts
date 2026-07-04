    export const checkChannelSubscriber = async (ctx: any) => {
        const channelMember = await ctx.telegram.getChatMember(
            '@kinomanovnet',
            ctx.from.id
        )

        return [
            'member',
            'administrator',
            'creator'
        ].includes(channelMember.status)
    }

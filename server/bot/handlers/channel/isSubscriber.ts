import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";
import {failedChannelSubscriber} from "#server/bot/handlers/auth/fail/failedChannelSubscriber";
import {supabase} from "~/services/movies/supabase";

export const isSubscriber = async (ctx: any) => {
    const isChannelSubscriber = await checkChannelSubscriber(ctx)



    if (!isChannelSubscriber) {
        await failedChannelSubscriber(ctx)
        await ctx.deleteMessage()
        return false
    } else {


        const user = await supabase
            .from('users')
            .select('subscriber')
            .eq('telegram_id', ctx.telegram_id)
            .single()

        await supabase
            .from('users')
            .insert({
                subscriber: true,
                telegram_id: user
            })
    }

    return true
}

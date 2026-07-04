import {checkChannelSubscriber} from "#server/bot/handlers/auth/check/checkChannelSubscriber";
import {failedChannelSubscriber} from "#server/bot/handlers/auth/fail/failedChannelSubscriber";
import {supabaseBot} from "~/services/movies/supabase";

export const isSubscriber = async (ctx: any) => {
    const isChannelSubscriber = await checkChannelSubscriber(ctx)

    if (!isChannelSubscriber) {
        await failedChannelSubscriber(ctx)
        await ctx.deleteMessage()
            // ... здесь код который меняет значение subscriber = false
        await supabaseBot
            .from('users')
            .update({
                subscriber: false
            })
            .eq('telegram_id', ctx.from.id)
        return false
    } else {
        // ...  ... здесь код который меняет значение subscriber = true
        await supabaseBot
            .from('users')
            .update({
                subscriber: true
            })
            .eq('telegram_id', ctx.from.id)
    }

    return true
}

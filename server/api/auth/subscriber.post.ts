import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {
    const body = await readBody(event)

    const supabase = await serverSupabaseClient(event)

    const {error} = await supabase
        .from('users')
        .update({
            subscriber: body.isSubscriber
        })
        .eq('telegram_id', body.telegram_id)

    if (error) {
        throw createError({
            statusCode: 500,
            message: error.message
        })
    }

    return {
        success: !error
    }
})


import {serverSupabaseServiceRole} from "#supabase/server";

export default defineEventHandler(async (event) => {
    const body = await readBody(event)

    const supabase = serverSupabaseServiceRole(event)

    const {error} = await supabase
        .from('users')
        .update({
            subscriber: body.isSubscriber
        })
        .eq('telegram_id', body.telegram_id)

    if (error) {
        throw createError({
            status: 500,
            message: error.message
        })
    }

    return {
        success: !error
    }
})

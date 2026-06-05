import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler( async (event) => {
    const token = getQuery(event).token

    if (!token) {
        throw createError({
            statusCode: 400,
            message: 'Token required'
        })
    }

    const supabase = await serverSupabaseClient(event)

    const {data, error} = await supabase
        .from('auth_requests')
        .select()
        .eq('token', token)
        .single()

    const {data: user} = await supabase
        .from('users')
        .select()
        .eq('telegram_id', data.telegram_id)
        .single()

    if (error || !data) {
        throw createError({
            statusCode: 401,
            message: 'Invalid token'
        })
    }

    return {
        data,
        user,
    }
})

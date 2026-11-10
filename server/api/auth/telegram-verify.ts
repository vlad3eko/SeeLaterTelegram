
import {serverSupabaseServiceRole} from "#supabase/server";
import {AUTH_REQUEST_TTL_MS, isAuthToken, isOlderThan} from "#server/utils/api/authTokens";

export default defineEventHandler( async (event) => {
    const token = getQuery(event).token

    if (!token) {
        throw createError({
            status: 400,
            message: 'Token required'
        })
    }

    if (!isAuthToken(token)) {
        throw createError({
            status: 401,
            message: 'Invalid token'
        })
    }

    const supabase = serverSupabaseServiceRole(event) as any

    const {data, error} = await supabase
        .from('auth_requests')
        .select('confirmed, created_at')
        .eq('token', token)
        .maybeSingle()

    if (error || !data || isOlderThan(data.created_at, AUTH_REQUEST_TTL_MS)) {
        throw createError({
            status: 401,
            message: 'Invalid token'
        })
    }

    // Браузеру отдаём только факт подтверждения: telegram_id и данные пользователя наружу не уходят.
    // Сам вход выполняется по этому же токену в telegram-login.
    return {
        data: {
            confirmed: data.confirmed === true
        },
        user: null,
    }
})

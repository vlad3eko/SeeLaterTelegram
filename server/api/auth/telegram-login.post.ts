
import {serverSupabaseServiceRole} from "#supabase/server";
import {AUTH_REQUEST_TTL_MS, isAuthToken, isOlderThan} from "#server/utils/api/authTokens";
import {SESSION_COOKIE} from "#server/utils/api/sessionUser";

export default defineEventHandler(async (event) => {

    const body = await readBody(event)
    const token = body?.token

    if (!isAuthToken(token)) {
        throw createError({
            status: 400,
            message: 'Invalid token'
        })
    }

    const supabase = serverSupabaseServiceRole(event) as any

    // Токен одноразовый: подтверждённый запрос забираем (удаляем) одной операцией,
    // поэтому один токен нельзя использовать дважды, в том числе параллельно.
    const {data: claimed, error: claimError} = await supabase
        .from('auth_requests')
        .delete()
        .eq('token', token)
        .eq('confirmed', true)
        .select('telegram_id, created_at')

    if (claimError) {
        throw createError({
            status: 500,
            message: 'Login request was not processed'
        })
    }

    const request = Array.isArray(claimed) ? claimed[0] : null

    if (!request || !request.telegram_id || isOlderThan(request.created_at, AUTH_REQUEST_TTL_MS)) {
        throw createError({
            status: 401,
            message: 'Login request is not confirmed'
        })
    }

    const {data: user} = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', request.telegram_id)
        .maybeSingle()

    if (!user) {
        throw createError({
            status: 404,
            message: 'User not found'
        })
    }

    const sessionToken = crypto.randomUUID()

    const { error } = await supabase
        .from('sessions')
        .insert({
            session_token: sessionToken,
            user_id: user.id
        })

    if (error) {
        throw createError({
            status: 500,
            message: 'Session was not created'
        })
    }

    setCookie(event, SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    })

    return {
        success: true
    }
})

import type {H3Event} from 'h3'
import {serverSupabaseServiceRole} from '#supabase/server'
import {isOlderThan, SESSION_TTL_MS} from '#server/utils/api/authTokens'

export const SESSION_COOKIE = 'session_token'

// Пользователь по cookie сессии сайта или null. Просроченные сессии удаляются.
export const getSessionUser = async (event: H3Event): Promise<any | null> => {

    const sessionToken = getCookie(event, SESSION_COOKIE)

    if (!sessionToken || sessionToken.length > 200) return null

    const supabase = serverSupabaseServiceRole(event) as any

    const {data: session} = await supabase
        .from('sessions')
        .select('user_id, created_at')
        .eq('session_token', sessionToken)
        .maybeSingle()

    if (!session) return null

    if (isOlderThan(session.created_at, SESSION_TTL_MS)) {
        await supabase
            .from('sessions')
            .delete()
            .eq('session_token', sessionToken)

        return null
    }

    const {data: user} = await supabase
        .from('users')
        .select()
        .eq('id', session.user_id)
        .maybeSingle()

    return user ?? null
}


import {serverSupabaseServiceRole} from "#supabase/server";
import {isAuthToken} from "#server/utils/api/authTokens";

// Запросы входа старше суток никому не нужны: чистим их при создании новых.
const STALE_REQUEST_MS = 24 * 60 * 60 * 1000

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

    const {data: existing} = await supabase
        .from('auth_requests')
        .select('token')
        .eq('token', token)
        .maybeSingle()

    if (existing) {
        throw createError({
            status: 409,
            message: 'Token already exists'
        })
    }

    const {error} = await supabase
        .from('auth_requests')
        .insert({token})

    if (error) {
        console.error('[AUTH REQUEST ERROR]', error)

        throw createError({
            status: 500,
            message: 'Login request was not created'
        })
    }

    try {
        await supabase
            .from('auth_requests')
            .delete()
            .lt('created_at', new Date(Date.now() - STALE_REQUEST_MS).toISOString())
    } catch (cleanupError) {
        console.warn('[AUTH REQUEST CLEANUP ERROR]', cleanupError)
    }

    return {
        success: true
    }
})


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

    // В таблице telegram_id обязателен (NOT NULL по схеме БД), поэтому до подтверждения в боте
    // стоит заглушка 0: настоящий id бот запишет в telegram-confirm. Реальный id всегда > 0,
    // так что заглушку нельзя принять за пользователя.
    const {error} = await supabase
        .from('auth_requests')
        .insert({
            token,
            telegram_id: 0,
            confirmed: false
        })

    if (error) {
        console.error('[AUTH REQUEST ERROR]', error)

        throw createError({
            status: 500,
            message: 'Login request was not created',
            // Только код ошибки PostgreSQL/PostgREST (без текста запроса и данных): нужен для диагностики.
            data: {code: error.code ?? null}
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


import {serverSupabaseServiceRole} from "#supabase/server";
import {AUTH_REQUEST_TTL_MS, isAuthToken, isOlderThan} from "#server/utils/api/authTokens";

// Вызывается ботом (роут закрыт middleware internal-only).
// /start принимает любой payload, поэтому нераспознанный токен — не ошибка: просто ничего не подтверждаем.
export default defineEventHandler(async (event) => {

    const body = await readBody(event)
    const token = body?.token
    const telegramId = Number(body?.telegram_id)

    if (!isAuthToken(token) || !Number.isSafeInteger(telegramId) || telegramId <= 0) {
        return {confirmed: false}
    }

    const supabase = serverSupabaseServiceRole(event) as any

    const {data: request, error: requestError} = await supabase
        .from('auth_requests')
        .select('token, confirmed, created_at')
        .eq('token', token)
        .maybeSingle()

    if (requestError) {
        console.error('[AUTH CONFIRM LOOKUP ERROR]', requestError)
        return {confirmed: false}
    }

    // Подтвердить можно только свежий и ещё не подтверждённый запрос: чужой telegram_id не перезаписывается.
    if (!request || request.confirmed === true || isOlderThan(request.created_at, AUTH_REQUEST_TTL_MS)) {
        return {confirmed: false}
    }

    const {data, error} = await supabase
        .from('auth_requests')
        .update({
            telegram_id: telegramId,
            confirmed: true
        })
        .eq('token', token)
        .or('confirmed.is.null,confirmed.eq.false')
        .select('token')

    if (error) {
        console.error('[AUTH CONFIRM ERROR]', error)
        return {confirmed: false}
    }

    return {confirmed: Array.isArray(data) && data.length > 0}
})

import { serverSupabaseServiceRole } from "#supabase/server"

export default defineEventHandler(async (event) => {

    const supabase = serverSupabaseServiceRole(event)
    const body = await readBody(event)
    const updateId = Number(body?.update_id)
    const handler = body?.handler

    if (!Number.isSafeInteger(updateId) || updateId < 0 || typeof handler !== 'string' || !handler) {
        throw createError({statusCode: 400, message: 'Некорректный update_id или handler'})
    }

    const { error } = await supabase
            .from('bot_processed_updates')
            .insert({
                update_id: updateId,
                handler
            })

    if (!error) {
        return {
            claimed: true
        }
    }

    // Повторное получение того же update_id.
    if (error.code === '23505') {
        return {
            claimed: false
        }
    }

    console.error('[TELEGRAM UPDATE CLAIM ERROR]', error)
    throw createError({statusCode: 500, message: 'Не удалось зарегистрировать Telegram update'})
})

import type {SupabaseClient} from "@supabase/supabase-js"

/**
 * Снимает блокировку «публикация идёт» с сессии редактирования администратора.
 * Вызывают финализатор (публикация закончена) и сообщения проверки Reel (проверка может
 * ждать часами, а с mode='publish' бот перехватывал бы обычные сообщения администратора).
 *
 * Модуль намеренно не импортирует бота: его подключают обработчики кнопок, которые
 * загружаются при создании бота, и импорт `#server/bot/bot` отсюда дал бы цикл.
 */

const asRecord = (value: unknown): Record<string, any> =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, any>
        : {}

export const resetAdminPublishLock = async (
    supabase: SupabaseClient,
    job: {
        admin_telegram_id: number | string
        media_id: number | string
        media_type: string
        content_type: string
        key_trailer: string
        input_payload: Record<string, any> | null
    }
): Promise<void> => {
    try {
        const {data: user, error: userError} = await supabase
            .from('users')
            .select('id')
            .eq('telegram_id', job.admin_telegram_id)
            .maybeSingle()

        if (userError || !user) return

        let query = supabase
            .from('card_edit_session')
            .update({mode: null, publish_started_at: null})
            .eq('user_id', user.id)
            .eq('media_id', job.media_id)
            .eq('media_type', job.media_type)
            .eq('content_type', job.content_type)
            .eq('key_trailer', job.key_trailer)
            .eq('mode', 'publish')

        const startedAt = asRecord(asRecord(job.input_payload).session).publishStartedAt
        if (startedAt != null) query = query.eq('publish_started_at', startedAt)

        const {error} = await query
        if (error) console.error('[REEL SESSION LOCK RESET ERROR]', error)
    } catch (error) {
        console.error('[REEL SESSION LOCK RESET ERROR]', error)
    }
}

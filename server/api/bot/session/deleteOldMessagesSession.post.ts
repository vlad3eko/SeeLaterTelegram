import { serverSupabaseClient } from "#supabase/server"
import { bot } from "#server/bot/bot"

export default defineEventHandler(async (event) => {

    const supabase = await serverSupabaseClient(event)
    const body = await readBody(event)

    const minutes = 0

    const expireDate = new Date(
        Date.now() - minutes * 60 * 1000
    ).toISOString()

    const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", body.telegram_id)
        .single()

    if (userError) {
        throw userError
    }

    let query = supabase
        .from("users_session")
        .select(`
            user_id,
            message_ids,
            users!inner (
                telegram_id
            )
        `)
        .eq("user_id", user.id)

    // если minutes > 0 — удаляем только старые сообщения
    if (minutes > 0) {
        query = query.lt("last_activity", expireDate)
    }

    const { data: session, error } = await query.single()

    if (error) {
        // если записи нет — это не ошибка
        if (error.code === "PGRST116") {
            return {
                success: true,
                deleted: 0
            }
        }

        throw error
    }

    const telegramId = session.users.telegram_id

    for (const message of session.message_ids ?? []) {

        // inline карточки не удаляем
        if(message.inlineMessageId) continue
        if (message.inlineMessageId) continue
        if (!message.messageId) continue

        try {

            await bot.telegram.deleteMessage(
                telegramId,
                message.messageId
            )

        } catch(err:any){

            console.log(
                `Не удалось удалить сообщение ${message.messageId}:`,
                err?.description || err?.message
            )

        }

    }

    const { error: updateError } = await supabase
        .from("users_session")
        .update({
            message_ids: []
        })
        .eq("user_id", session.user_id)

    if (updateError) {
        console.error(updateError)
    }

    return {
        success: true,
        deleted: session.message_ids?.length ?? 0
    }
})

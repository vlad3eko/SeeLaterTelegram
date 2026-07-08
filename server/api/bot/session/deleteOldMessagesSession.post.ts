import { serverSupabaseClient } from "#supabase/server"
import { bot } from "#server/bot/bot"

export default defineEventHandler(async (event) => {

    const supabase = await serverSupabaseClient(event)
    const body = await readBody(event)

    // const minutes = 2
    //
    // const expireDate = new Date(
    //     Date.now() - minutes * 60 * 1000
    // ).toISOString()

    const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", body.telegram_id)
        .single();

    if (userError) throw userError;

    const { data: sessions, error } = await supabase
        .from("users_session")
        .select(`
        user_id,
        message_ids,
        users!inner (
            telegram_id
        )
    `)
        .eq("user_id", user.id)
        .single()
        // .lt("last_activity", expireDate)

    if (error) {
        throw error
    }

    for (const session of sessions) {

        const telegramId = session.users.telegram_id

        for (const message of session.message_ids ?? []) {

            if (!message?.id) continue

            try {
                await bot.telegram.deleteMessage(
                    telegramId,
                    message.id
                )
            } catch (err: any) {
                console.log(
                    `Не удалось удалить сообщение ${message.id}:`,
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
    }

    return {
        success: true,
        deleted: sessions.length
    }
})

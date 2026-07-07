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
        // .lt("last_activity", expireDate)

    console.log('sessions', sessions)
    console.log('JSON', JSON.stringify(sessions, null, 2))

    if (error) {
        throw error
    }

    if (!sessions?.length) {
        return {
            success: true,
            deleted: 0
        }
    }

    for (const session of sessions) {

        const telegramId = session.users.telegram_id

        const mediaSaved = []

        for (const message of session.message_ids ?? []) {

            if (message.type === 'media') {
                mediaSaved.push(message)
                continue
            }

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

        const { error: deleteError } = await supabase
            .from("users_session")
            .update({
                message_ids: mediaSaved
            })
            .eq("user_id", session.user_id)

        if (deleteError) {
            console.error(deleteError)
        }
    }

    return {
        success: true,
        deleted: sessions.length
    }
})

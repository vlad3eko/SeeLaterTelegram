import { serverSupabaseClient } from "#supabase/server";
import { bot } from "#server/bot/bot";

export default defineEventHandler(async (event) => {

    const supabase = await serverSupabaseClient(event);
    const minutes = 1

    const expireDate = new Date(
        Date.now() - minutes * 60 * 1000
    ).toISOString();

    const { data: sessions, error } = await supabase
        .from("users_session")
        .select(`
            user_id,
            message_ids,
            users (
                telegram_id
            )
        `)
        .lt("last_activity", expireDate);

    if (error) {
        throw error;
    }

    for (const session of sessions ?? []) {

        const telegramId = session.users?.telegram_id;

        if (!telegramId) {
            continue;
        }

        for (const messageId of session.message_ids ?? []) {

            try {

                await bot.telegram.deleteMessage(
                    telegramId,
                    messageId
                );

            } catch {

                console.log(`Не удалось удалить сообщение ${messageId}`);

            }

        }

        await supabase
            .from("users_session")
            .delete()
            .eq("user_id", session.user_id);

    }

    return {
        success: true,
        deleted: sessions?.length ?? 0
    };

});

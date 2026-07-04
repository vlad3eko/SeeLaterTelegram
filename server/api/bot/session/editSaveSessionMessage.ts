import { serverSupabaseClient } from "#supabase/server";

export default defineEventHandler(async (event) => {
    const supabase = await serverSupabaseClient(event);
    const body = await readBody(event);

    // 1. ищем пользователя
    const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", body.telegram_id)
        .single();

    if (userError || !user) {
        throw createError({
            statusCode: 404,
            message: "Пользователь не найден removeSessionMessage"
        });
    }

    // 2. удаляем message_id из массива
    const { error: rpcError } = await supabase.rpc("save_session_message", {
        p_user_id: user.id,
        p_message_id: body.message_id
    });

    if (rpcError) {
        throw rpcError;
    }

    return {
        success: true
    };
});

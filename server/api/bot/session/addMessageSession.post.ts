import { serverSupabaseClient } from "#supabase/server"

export default defineEventHandler(async (event) => {
    const supabase = await serverSupabaseClient(event)
    const body = await readBody(event)

    const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("telegram_id", body.telegram_id)
        .single()

    if (userError || !user) {
        throw createError({
            statusCode: 404,
            message: "Пользователь не найден editAddSessionMessage"
        })
    }

    const { error } = await supabase.rpc("add_session_message", {
        p_user_id: user.id,
        p_message_id: body.message_id,
        p_type: body.type
    })

    if (error) {
        throw error
    }

    return {
        success: true
    }
})

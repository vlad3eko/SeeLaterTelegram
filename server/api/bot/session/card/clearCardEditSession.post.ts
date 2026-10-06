import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const supabase = await serverSupabaseClient(event)
    const body = await readBody(event)

    const {data: user, error: userError} = await supabase
        .from('users')
        .select("id")
        .eq('telegram_id', body.telegram_id)
        .single()

    if (userError || !user)
        throw createError({statusCode: 404, message: "Пользователь не найден editAddSessionMessage"})


    const {error} = await supabase
        .from('card_edit_session')
        .delete()
        .eq('user_id', user)

    if (error)
        throw createError({statusCode: 500, message: `Ошибка удаления данных: ${error.message}`})

})

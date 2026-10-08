import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const supabase = await serverSupabaseClient(event)
    const body = await readBody(event)
    const telegramId = body?.telegram_id

    if (!telegramId)
        throw createError({statusCode: 400, message: 'telegram_id or data invalid [clearSessionEditCard.post]'})

    const {data: user, error: userError} = await supabase
        .from('users')
        .select("id")
        .eq('telegram_id', telegramId)
        .single()

    if (userError || !user)
        throw createError({statusCode: 404, message: "Пользователь не найден [clearSessionEditCard.post]"})


    const {error} = await supabase
        .from('card_edit_session')
        .delete()
        .eq('user_id', user.id)

    if (error)
        throw createError({statusCode: 500, message: `Ошибка удаления данных: ${error.message}`})

    return {
        success: true
    }
})

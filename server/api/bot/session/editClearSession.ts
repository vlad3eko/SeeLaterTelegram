import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {
    const supabase = await serverSupabaseClient(event)
    const body = await readBody(event)

    const {data: user} = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', body.telegram_id)
        .single()

    if (!user) {
        throw createError({
            statusCode: 404,
            message: 'Пользователь не найден editAddSessionMessage'
        })
    }

    const {error} = await supabase
        .from('users_session')
        .delete()
        .eq('user_id', user.id)

    if (error) throw error
})

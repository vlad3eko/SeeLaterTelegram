import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {
    const supabase =
        await serverSupabaseClient(event)
    const body =
        await readBody(event)

    const {data: user} = await supabase
        .from('user')
        .select('id')
        .eq('telegram_id', body.telegram_id)
        .single()

    if (!user) {
        throw createError({
            statusCode: 500,
            message: 'Пользователь не найдет editGetSession'
        })
    }

    const {data, error} = await supabase
        .from('users_session')
        .select('*')
        .eq('user_id', user.id)
        .single()

    if (error) return null

    return data
})

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

    const {data} = await supabase
        .from('users_session')
        .select('message_ids')
        .eq('user_id', user.id)
        .single()

    const messages = data?.message_ids ?? []

    messages.push(body.message_id)

    const {error} = await supabase
        .from('users_session')
        .upsert({
            user_id: user.id,
            last_activity: new Date().toISOString(),
            message_ids: messages
        })

        if (error) throw error
})

import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {
    const supabase = await serverSupabaseClient(event)
    const body = await readBody(event)

    const {data: user, error: userError} = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', body.telegram_id)
        .single()

    if (userError || !user) {
        throw createError({
            statusCode: 404,
            message: 'пользователь не найден saveMessageSession'
        })
    }

    const {error: prcError} = await supabase.rpc(
        'remove_message_session',
        {
            p_user_id: user.id,
            p_message_id: body.message_id,
            p_inline_message_id: body.inline_message_id
        }
    )

    if (prcError) {
        throw prcError
    }

    return {
        success: true
    }
})

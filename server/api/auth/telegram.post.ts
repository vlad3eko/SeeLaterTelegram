import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const body = await readBody(event)

    const supabase = await serverSupabaseClient(event)

    const { data, error } = await supabase
        .from('users')
        .upsert(
            {
                telegram_id: Number(body.telegram_id),
                username: body.username,
                first_name: body.first_name,
                subscriber: false
            },
            {
                onConflict: 'telegram_id'
            }
        )
        .select()

    if (error) {
        throw createError({
            statusCode: 500,
            message: error.message
        })
    }

    return data
})

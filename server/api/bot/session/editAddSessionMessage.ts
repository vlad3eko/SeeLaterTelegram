import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {
    const supabase =
        await serverSupabaseClient(event)
    const body =
        await readBody(event)

    const {data} = await supabase
        .from('users')
        .select('message_ids')
        .eq('telegram_id', body.telegram_id)
        .single()

    const messages = data?.message_ids ?? []

    messages.push(body.message_id)

    const {error} = await supabase
        .from('users')
        .update({
            last_activity: new Date().toISOString(),
            message_ids: messages
        })
        .eq('telegram_id', body.telegram_id)

    if (error) throw error
})

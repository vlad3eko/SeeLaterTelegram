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
    console.log('data', data)


})

import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler( async (event) => {

    const body = await readBody(event)

    const supabase = await serverSupabaseClient(event)

    const {data} = await supabase
        .from('auth_requests')
        .update({
            token: body.token,
            telegram_id: body.telegram_id,
            confirmed: true
        })
        .eq('token', body.token)

    return data
})

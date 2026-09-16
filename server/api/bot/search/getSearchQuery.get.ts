import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const supabase = await serverSupabaseClient(event)

    const telegramId = Number(query.user_id)
    if (!telegramId) return

    const {data} = await supabase
        .from('last_inline_search')
        .select('last_search_query')
        .eq('telegram_id', telegramId)
        .single()

    if (!data?.last_search_query) return

    return JSON.parse(data.last_search_query)
})

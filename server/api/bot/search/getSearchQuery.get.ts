import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const supabase = await serverSupabaseClient(event)

    const telegramId = query.user_id

    const {data} = await supabase
        .from('last_inline_search')
        .select('last_search_query')
        .eq('telegram_id', telegramId)
        .single()

   const results = JSON.parse(data.last_search_query)

    return {
        ...results
    }
})

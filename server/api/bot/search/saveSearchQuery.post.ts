import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)

    console.log('query q', query.q)
    console.log('query media_type', query.media_type)
    console.log('query user_id', query.user_id)

    const supabase = await serverSupabaseClient(event)

    const searchQuery = []
    const mediaType = query.media_type === 'movie' ? 'фильм' : 'сериал'
    const filters = searchQuery.push(query.q, mediaType)
    console.log('filters', filters)
    const telegramId = query.user_id

    await supabase
        .from('last_inline_search')
        .upsert({
            telegram_id: telegramId,
            last_search_query: searchQuery
        })
})

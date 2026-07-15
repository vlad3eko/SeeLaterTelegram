import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)

    console.log('query q', query.q)
    console.log('query media_type', query.media_type)
    console.log('query user_id', query.user_id)

    const supabase = await serverSupabaseClient(event)

    const mediaType = query.media_type === 'movie' ? 'фильм' : 'сериал'
    const telegramId = query.user_id

    const searchQuery = [
        mediaType,
        ...(Array.isArray(query.q) ? query.q : [query.q])
    ]
    console.log('filters', searchQuery)

    await supabase
        .from('last_inline_search')
        .upsert({
            telegram_id: telegramId,
            last_search_query: searchQuery
        })
        .select()
})

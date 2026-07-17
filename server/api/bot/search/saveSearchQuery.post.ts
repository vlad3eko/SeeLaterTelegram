import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)

    const supabase = await serverSupabaseClient(event)

    let mediaType
    if (query.media_type) {
        mediaType = query.media_type === 'movie' ? 'фильм' : 'сериал'
    }

    let q
    if (query.q) {
        q = Array.isArray(query.q) ? query.q : [query.q]
    }

    const telegramId = query.user_id

    const searchQuery = [
        mediaType ? mediaType : 'фильм',
        ...(q ? q : '')
    ]

    console.log('[SAVE SEARCH QUERY] query', query, )
    console.log('[SAVE SEARCH QUERY] mediaType', mediaType, )
    console.log('[SAVE SEARCH QUERY] q', q, )
    console.log('[SAVE SEARCH QUERY] telegramId', telegramId, )
    console.log('[SAVE SEARCH QUERY] searchQuery', searchQuery, )

    await supabase
        .from('last_inline_search')
        .upsert({
                telegram_id: telegramId,
                last_search_query: searchQuery
            },
            {
                onConflict: 'telegram_id'
            })
        .select()
})

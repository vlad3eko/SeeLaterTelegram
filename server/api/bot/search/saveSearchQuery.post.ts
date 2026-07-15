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

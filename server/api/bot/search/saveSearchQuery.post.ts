import {serverSupabaseClient} from "#supabase/server";
import {contentTypeConvert} from "~/utils/convert/contentTypeConvert";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)

    const supabase = await serverSupabaseClient(event)

    const mediaType = contentTypeConvert(query.media_type, query.content_type)

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

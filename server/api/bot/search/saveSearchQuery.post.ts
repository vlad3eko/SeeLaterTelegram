import {serverSupabaseClient} from "#supabase/server";
import {contentTypeConvert} from "~/utils/convert/contentTypeConvert";
import type {ContentType} from "#server/global/engine/search/strategy/enums";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)

    const supabase = await serverSupabaseClient(event)

    const contentType =
        Array.isArray(query.content_type)
            ? query.content_type[0]
            : query.content_type

    const mediaType = contentTypeConvert(
        query.media_type,
        contentType as ContentType
    )

    const q =
        Array.isArray(query.q)
            ? query.q
            : query.q
                ? [query.q]
                : []

    const telegramId = Number(query.user_id)

    const searchQuery = [
        mediaType,
        ...q
    ]
        .filter(Boolean)
        .join(' ')

    await supabase
        .from('last_inline_search')
        .upsert(
            {
                telegram_id: telegramId,
                last_search_query: searchQuery
            },
            {
                onConflict: 'telegram_id'
            }
        )
        .select()
})

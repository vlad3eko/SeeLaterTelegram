import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const mediaId = Number(
        query.mediaId
    )

    const mediaType = query.mediaType

    const supabase = await serverSupabaseClient(event)

    const { data, error } = await supabase
        .from('published_media_messages')
        .select('content_type')
        .eq('media_id', mediaId)
        .eq('media_type', mediaType)
        .order('created_at', { ascending: false })
        .limit(1)

    if (error) {
        throw createError({
            statusCode:
                500,
            statusMessage:
            error.message
        })
    }

    return data?.[0] ?? null
})

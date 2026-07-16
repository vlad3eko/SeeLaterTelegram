import {serverSupabaseClient} from "#supabase/server"

const DEFAULT_TTL_DAYS = 7

export const buildCacheKey = (
    endpoint: string,
    params: Record<string, any> = {}
) => {

    const query = Object.entries(params)

        .filter(([_, value]) =>
            value !== undefined &&
            value !== null &&
            value !== ""
        )

        .sort(([a], [b]) =>
            a.localeCompare(b)
        )

        .map(([key, value]) =>
            `${key}=${String(value).trim().toLowerCase()}`
        )

        .join("&")

    return `${endpoint}|${query}`
}

export const getCache = async (
    event: any,
    cacheKey: string
) => {

    const totalStart = performance.now()


    // создание клиента Supabase
    const clientStart = performance.now()

    const supabase =
        await serverSupabaseClient(event)


    console.log(
        `[CACHE] CLIENT ${
            (performance.now() - clientStart)
                .toFixed(2)
        }ms`
    )


    // запрос SELECT
    const selectStart = performance.now()

    const {data, error} = await supabase
        .from('tmdb_cache')
        .select(
            'id,response_data'
        )
        .eq('cache_key', cacheKey)
        .gt(
            'expires_at',
            new Date().toISOString()
        )
        .maybeSingle()


    console.log(
        `[CACHE] SELECT ${
            (performance.now() - selectStart)
                .toFixed(2)
        }ms`
    )


    if (error) {

        console.error(
            '[CACHE] ERROR',
            error
        )

        return null
    }


    if (!data) {

        console.log(
            '[CACHE] MISS'
        )

        console.log(
            `[CACHE] TOTAL ${
                (performance.now() - totalStart)
                    .toFixed(2)
            }ms`
        )

        return null
    }


    // увеличение hits
    const rpcStart = performance.now()

    const {error: rpcError} =
        await supabase.rpc(
            'increment_tmdb_cache_hit',
            {
                cache_id: data.id
            }
        )


    console.log(
        `[CACHE] RPC HIT ${
            (performance.now() - rpcStart)
                .toFixed(2)
        }ms`
    )


    if (rpcError) {

        console.error(
            '[CACHE] RPC ERROR',
            rpcError
        )

    }


    console.log(
        '[CACHE] HIT'
    )


    console.log(
        `[CACHE] TOTAL ${
            (performance.now() - totalStart)
                .toFixed(2)
        }ms`
    )


    return data.response_data
}



export const saveCache = async (
    event: any,
    endpoint: string,
    cacheKey: string,
    response: any,
    ttl: number
) => {


    const totalStart = performance.now()


    // создание клиента Supabase
    const clientStart = performance.now()

    const supabase =
        await serverSupabaseClient(event)


    console.log(
        `[CACHE] CLIENT ${
            (performance.now() - clientStart)
                .toFixed(2)
        }ms`
    )


    const expires =
        new Date(
            Date.now() +
            ttl * 24 * 60 * 60 * 1000
        )


    const saveStart = performance.now()


    const {error} = await supabase
        .from('tmdb_cache')
        .upsert(
            {
                cache_key: cacheKey,
                endpoint,
                response_data: response,
                expires_at: expires.toISOString(),
                hits: 1,
                last_hit_at: new Date().toISOString()
            },
            {
                onConflict:'cache_key'
            }
        )


    console.log(
        `[CACHE] SAVE QUERY ${
            (performance.now() - saveStart)
                .toFixed(2)
        }ms`
    )


    if(error){

        console.error(
            '[CACHE] SAVE ERROR',
            error
        )

        return false
    }


    console.log(
        `[CACHE] SAVE TOTAL ${
            (performance.now() - totalStart)
                .toFixed(2)
        }ms`
    )


    return true
}

export const deleteExpired = async (
    event: any
) => {

    const supabase =
        await serverSupabaseClient(event)

    const {error} =
        await supabase

            .from("tmdb_cache")

            .delete()

            .lt(
                "expires_at",
                new Date().toISOString()
            )

    if (error) {

        console.error(
            "[TMDB CACHE] DELETE ERROR",
            error.message
        )

        return
    }

    console.log(
        "[TMDB CACHE] EXPIRED REMOVED"
    )
}

export const getPopular = async (
    event: any,
    limit = 20
) => {

    const supabase =
        await serverSupabaseClient(event)

    const {data, error} =
        await supabase

            .from("tmdb_cache")

            .select("*")

            .order(
                "hits",
                {
                    ascending: false
                }
            )

            .limit(limit)

    if (error) {

        console.error(
            "[TMDB CACHE] POPULAR ERROR",
            error.message
        )

        return []
    }

    return data ?? []
}

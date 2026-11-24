
import {serverSupabaseServiceRole} from "#supabase/server"

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

    const clientStart = performance.now()
    const supabase = serverSupabaseServiceRole(event)

    console.log(
        `[CACHE] CLIENT ${(performance.now() - clientStart).toFixed(2)}ms`
    )

    const rpcStart = performance.now()

    const {data, error} = await supabase.rpc(
        'get_tmdb_cache',
        {
            p_cache_key: cacheKey
        }
    )

    console.log(
        `[CACHE] RPC ${(performance.now() - rpcStart).toFixed(2)}ms`
    )

    if (error) {
        console.error('[CACHE] ERROR', error)
        return null
    }

    if (!data) {
        console.log('[CACHE] MISS')
        console.log(
            `[CACHE] TOTAL ${(performance.now() - totalStart).toFixed(2)}ms`
        )
        return null
    }

    console.log('[CACHE] HIT')
    console.log(
        `[CACHE] TOTAL ${(performance.now() - totalStart).toFixed(2)}ms`
    )

    return data
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

    const supabase = serverSupabaseServiceRole(event)


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
        serverSupabaseServiceRole(event)

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
        serverSupabaseServiceRole(event)

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

/**
 * Пакетное чтение кэша одним запросом (живые записи по списку ключей): ключ → ответ.
 * Для мелких записей, которых нужно много сразу (ключевые слова кандидатов «Похожих»).
 */
export const getCacheMany = async (
    event: any,
    cacheKeys: string[]
): Promise<Map<string, any>> => {
    const found = new Map<string, any>()
    if (!cacheKeys.length) return found

    const supabase = serverSupabaseServiceRole(event)
    const {data, error} = await supabase
        .from('tmdb_cache')
        .select('cache_key, response_data')
        .in('cache_key', cacheKeys)
        .gt('expires_at', new Date().toISOString())

    if (error) {
        console.error('[CACHE] MANY ERROR', error.message)
        return found
    }

    for (const row of data ?? []) found.set(row.cache_key, row.response_data)
    console.log(`[CACHE] MANY ${found.size}/${cacheKeys.length}`)
    return found
}

/** Пакетная запись в кэш одним upsert. */
export const saveCacheMany = async (
    event: any,
    endpoint: string,
    entries: Array<{cacheKey: string, response: any}>,
    ttl: number
) => {
    if (!entries.length) return true

    const supabase = serverSupabaseServiceRole(event)
    const now = new Date()
    const expires = new Date(now.getTime() + ttl * 24 * 60 * 60 * 1000).toISOString()

    const {error} = await supabase
        .from('tmdb_cache')
        .upsert(entries.map(entry => ({
            cache_key: entry.cacheKey,
            endpoint,
            response_data: entry.response,
            expires_at: expires,
            hits: 1,
            last_hit_at: now.toISOString()
        })), {onConflict: 'cache_key'})

    if (error) {
        console.error('[CACHE] SAVE MANY ERROR', error.message)
        return false
    }
    return true
}

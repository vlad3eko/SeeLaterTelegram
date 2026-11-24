
import {buildCacheKey, getCache, saveCache} from "#server/global/engine/search/repository/cacheRepository";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const config = useRuntimeConfig()
    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }
    const params = new URLSearchParams({
        language: 'ru-RU',
        page: String(query.page || 1),
    })

    const media = query.media || 'movie'
    const endpoint = 'discover'

    // media попадает в путь запроса к TMDB, поэтому допускаем только известные значения.
    if (media !== 'movie' && media !== 'tv') {
        throw createError({
            status: 400,
            message: "Invalid media"
        })
    }

    if(query.with_genres){
        params.append(
            'with_genres',
            String(query.with_genres)
        )
    }

    // Страна производства (ISO 3166-1, две буквы) — каталог сайта «фильмы и сериалы страны».
    const originCountry = /^[A-Za-z]{2}$/.test(String(query.with_origin_country || ''))
        ? String(query.with_origin_country).toUpperCase()
        : undefined
    if (originCountry) params.append('with_origin_country', originCountry)

    if (query.primary_release_year) {
        if (media === 'movie') {
            params.append('primary_release_year', String(query.primary_release_year))
        } else params.append('first_air_date_year', String(query.primary_release_year))
    }

    if(query.sort_by){
        params.append(
            'sort_by',
            String(query.sort_by)
        )
    }

    const cacheKey = buildCacheKey(endpoint, {
        media,
        page: query.page,
        with_genres: query.with_genres,
        primary_release_year: query.primary_release_year,
        sort_by: query.sort_by,
        with_origin_country: originCountry,
    })

    const cache = await getCache(event, cacheKey)
    if (cache) return cache

    const tmdbStart =
        performance.now()

    const res = await fetch(
        `https://api.themoviedb.org/3/discover/${media}?${params}`,
        {
            headers
        }
    )

    if (!res.ok) {
        throw createError({
            status: res.status,
            message: await res.text()
        })
    }

    const response = await res.json()

    response.results = response.results.map((item: any) => ({
        ...item,
        media_type: media
    }))

    await saveCache(event, endpoint, cacheKey, response, 1)

    console.log(
        `[TMDB] DISCOVER ${(performance.now()-tmdbStart).toFixed(2)}ms`
    )

    return response
})

export const tmdbFetch = async <T>(
    path: string,
    options?: any
) => {

    // Пустая база — свои роуты /api/tmdb/* этого же сервера (так и в production, и в dev).
    // DEV_TMDB_API_BASE_URL=https://kinomanov.net в dev отправляет запросы через продакшен,
    // как было раньше (пока Vercel на паузе, продакшен отвечает 402).
    const baseUrl =
        process.env.NODE_ENV === 'development'
            ? (process.env.DEV_TMDB_API_BASE_URL?.trim().replace(/\/$/, '') ?? '')
            : ''

    return await $fetch<T>(
        `${baseUrl}${path}`,
        options
    )
}


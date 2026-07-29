export const tmdbFetch = async <T>(
    path: string,
    options?: any
) => {

    const baseUrl =
        process.env.NODE_ENV === 'development'
            ? 'https://kinomanov.net'
            : ''

    return await $fetch<T>(
        `${baseUrl}${path}`,
        options
    )
}

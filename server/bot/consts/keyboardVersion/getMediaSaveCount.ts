export const getMediaSaveCount = async (tmdbId: number) => {
    return await $fetch<number>(
        '/api/bot/library/getFavoriteCount',
        {
            query: {
                tmdbId
            }
        }
    )
}

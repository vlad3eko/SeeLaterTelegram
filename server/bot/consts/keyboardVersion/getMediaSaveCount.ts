import {internalFetch} from "#server/utils/api/internalFetch";

export const getMediaSaveCount = async (tmdbId: number) => {
    return await internalFetch<number>(
        '/api/bot/library/getFavoriteCount',
        {
            query: {
                tmdbId
            }
        }
    )
}

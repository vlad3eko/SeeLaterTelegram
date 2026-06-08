import type {MediaTypesSupabase} from "~/types/bookmarks/media.types";

export default defineEventHandler(async (event) => {

    const body = await readBody(event)

    const config = useRuntimeConfig()

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${config.tmdbApiKey}`
    }

    return await Promise.all(
        body.favorites.map(async (item: MediaTypesSupabase) => {

            const response = await fetch(
                `https://api.themoviedb.org/3/${item.media_type}/${item.tmdb_id}?language=ru-RU`,
                { headers }
            )

            const media = await response.json()

            return {
                ...media,
                media_type: item.media_type
            }
        })
    )
})

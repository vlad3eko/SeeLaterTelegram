
import type {MediaTypesSupabase} from "~/types/bookmarks/media.types";
import {useUserStore} from "~/stores/user.store";

export const useMovieStore = defineStore('movies', () => {

    const user = useUserStore()

    const movies = ref<MediaTypesSupabase[]>([])

    const createMovie = async (payload: Partial<MediaTypesSupabase>) => {

        if (!user.data) return

        // Запись идёт через сервер: он сам берёт user_id из сессии, браузер к базе не обращается.
        try {
            const data = await $fetch('/api/favorites/add', {
                method: 'POST',
                body: {
                    tmdb_id: payload.tmdb_id,
                    title: payload.title || payload.name,
                    media_type: payload.media_type,
                    poster_path: payload.poster_path || payload.backdrop_path,
                    vote_average: payload.vote_average,
                    vote_count: payload.vote_count,
                    release_date: payload.release_date || payload.first_air_date,
                }
            })

            return {data, error: null}
        } catch (error) {
            return {data: null, error}
        }
    }

    return {
        movies,
        createMovie,
    }
})

import type {MediaTypesSupabase} from "~/types/bookmarks/media.types";
import {useUserStore} from "~/stores/user.store";
import {createFavorite} from "#server/bot/services/supabase/addFavorite";

export const useMovieStore = defineStore('movies', () => {

    const supabase = useSupabaseClient()
    const user = useUserStore()

    const movies = ref<MediaTypesSupabase[]>([])

    const createMovie = async (payload: Partial<MediaTypesSupabase>) => {

        if (!user.data) return

        const {data, error} = await createFavorite(supabase, {
            userId: user.data.id,
            tmdbId: payload.tmdb_id,
            title: payload.title || payload.name,
            mediaType: payload.media_type,
            posterPath: payload.poster_path || payload.backdrop_path,
            voteAverage: payload.vote_average,
            voteCount: payload.vote_count,
            releaseDate: payload.release_date || payload.first_air_date,
        })

        return {data, error}
    }

    return {
        movies,
        createMovie,
    }
})

import type {MediaTypesSupabase} from "~/types/bookmarks/media.types";
import {useUserStore} from "~/stores/user.store";

export const useMovieStore = defineStore('movies', () => {

    const supabase = useSupabaseClient()
    const user = useUserStore()

    const movies = ref<MediaTypesSupabase[]>([])

    const createMovie = async (payload: Partial<MediaTypesSupabase>) => {

        if (!user.data) return

        const {data, error} = await supabase
            .from('favorites')
            .insert({
                user_id: user.data.id,
                tmdb_id: payload.tmdb_id,
                title: payload.title || payload.name,
                media_type: payload.media_type,
                poster_path: payload.poster_path || payload.backdrop_path,
                vote_average: payload.vote_average,
                vote_count: payload.vote_count,
                release_date: payload.release_date || payload.first_air_date
            })
            .select()

        return {data, error}
    }

    return {
        movies,
        createMovie,
    }
})

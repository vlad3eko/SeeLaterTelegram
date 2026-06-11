import type {Movie} from "~/types/movie.types";
import type {MediaTypesSupabase} from "~/types/bookmarks/media.types";
import {useAuth} from "~/composables/auth/useAuth";

export const useMovieStore = defineStore('movies', () => {

    const supabase = useSupabaseClient()
    const {user} = useAuth()

    const movies = ref<MediaTypesSupabase[]>([])

    const createMovie = async (payload: Partial<MediaTypesSupabase>) => {

            const {data, error} = await supabase
                .from('favorites')
                .insert({
                    user_id: user.value.id,
                    title: payload.title,
                    tmdb_id: payload.tmdb_id,
                    media_type: payload.media_type,
                })
                .select()

            return {data, error}
    }

    return {
        movies,
        createMovie,
    }
})

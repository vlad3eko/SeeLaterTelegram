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

import type {Movie} from "~/types/movie.types";
import type {MediaTypesSupabase} from "~/types/bookmarks/media.types";
import {useAuth} from "~/composables/auth/useAuth";

export const useMovieStore = defineStore('movies', () => {

    const supabase = useSupabaseClient()
    const media = useRoute().params.media
    const {user} = useAuth()

    const movies = ref<MediaTypesSupabase[]>([])

    const createMovie = async (payload: Partial<MediaTypesSupabase>) => {

        console.log('2', payload)

        const {data: existingMedia} = await supabase
            .from('favorites')
            .select()
            .eq('user_id', user.value.id)
            .eq('tmdb_id', payload.tmdb_id)
            .single()

        console.log('3', payload)
        console.log('3.5', existingMedia)

        if (existingMedia) {
            return {
                data: null,
                error: 'Фильм уже добавлен'
            }
        }
        console.log('4', payload)

        const {data, error} = await supabase
             .from('favorites')
             .insert({
                 user_id: user.value.id,
                 title: payload.title,
                 tmdb_id: payload.tmdb_id,
                 media_type: media,
             })
             .select();

        console.log('4', data)
        return {data, error}
    }


    return {
        movies,
        createMovie,
    }
})

import type {Movie, MoviePayload, MovieSortField} from "~/types/movie.types";

export const useMovieStore = defineStore('movies', () => {

    const supabase = useSupabaseClient()

    const movies = ref<Movie[]>([])

    const createMovie = async (payload: Partial<Movie>) => {
        const {data, error} = await supabase
             .from('movies')
             .insert(payload)
             .select();

        return {data, error}
    }

    const deleteMovie = async (id: number) => {
        const {error} = await supabase
            .from('movies')
            .delete()
            .eq('id', id)

        if (error) console.log('Ошибка deleteMovie', error)

        movies.value = movies.value.filter(
            smoothie => smoothie.id !== id
        )
    }

    return {
        movies,
        createMovie,
        deleteMovie,
    }
})

import type {Movie} from "~/types/movie.types";

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

    return {
        movies,
        createMovie,
    }
})

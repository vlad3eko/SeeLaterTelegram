import type {Movie, MoviePayload, MovieSortField} from "~/types/movie.types";

export const useMovieStore = defineStore('movies', () => {

    const supabase = useSupabaseClient()

    const movies = ref<Movie[]>([])
    const movie = ref<Movie | null>(null)
    const loading = ref<boolean>(true)

    const getMovies = async (sortBy: MovieSortField = 'created_at') => {
        const {data, error} = await supabase
            .from('movies')
            .select()
            .order(sortBy, {ascending: false})

        if (error) {
            console.log('Ошибка getMovies: ', error.message)
            return
        }
        movies.value = data
        loading.value = false
    }

    const getMovie = async (id: number) => {
        const {data, error} = await supabase
            .from('movies')
            .select()
            .eq('id', id)
            .single()

        if (error) {
            await navigateTo('/')
        } else if (data) {
            movie.value = data
            loading.value = false
        }
    }

    const createMovie = async (payload: MoviePayload) => {
        const {data, error} = await supabase
             .from('movies')
             .insert(payload)
             .select();

        return {data, error}
    }

    const updateMovie = async (payload: MoviePayload, id: number) => {
        const {data, error} = await supabase
            .from('movies')
            .update(payload)
            .eq('id', id)
            .select()

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
        movie,
        movies,
        loading,
        getMovies,
        getMovie,
        createMovie,
        updateMovie,
        deleteMovie,
    }
})

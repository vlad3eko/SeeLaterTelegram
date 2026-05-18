import type {TmdbResponse} from "~/types/tmdb.types";

export const useTmdbSearch = () => {
    const searchInput = ref<string>('')

    const {data, pending, refresh} = useAsyncData<TmdbResponse>('movies-search',
        () => $fetch('/api/tmdb/search', {
            query: {
                q: searchInput.value
            }
        }))

    const movies = computed(() => {
        return data.value?.results || []
    })

    const searchMovies = async () => {
        await refresh()
    }

    return {
        searchInput,
        movies,
        pending,
        searchMovies,
    }
}

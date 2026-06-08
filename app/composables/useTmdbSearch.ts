import type {TmdbResponse} from "~/types/tmdb.types";

export const useTmdbSearch = () => {

    const searchInput = ref<string>()

    const {data, pending, refresh} = useAsyncData<TmdbResponse>('media-search',
        () => $fetch('/api/tmdb/search', {
            query: {
                q: searchInput.value,
            }
        }),
        {
            immediate: false
        }
    )


    const movies = computed(() => {
        return data.value?.results || []
    })

    const searchMovies = async () => {
        await refresh()
    }

    return {
        movies,
        pending,
        searchInput,
        searchMovies,
    }
}

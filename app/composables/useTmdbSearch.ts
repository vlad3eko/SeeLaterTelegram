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
        return (data.value?.results || []).filter(media => {
                const description = media.overview
                const releaseDate =
                    'release_date' in media
                        ? media.release_date
                        : media.first_air_date
                return (releaseDate && media.poster_path && description)
            }
        )
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

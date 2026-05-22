import type {TmdbMovieDetails} from "~/types/tmdb.types";

export const useMovieDetails = () => {

    const movieStore = useMovieStore()

    const route = useRoute()
    const slug = route.params.slug

    const idMovie = computed(() => {
        return String(slug).split('-')[0]
    })

    const {data, pending} = useAsyncData<TmdbMovieDetails>(`movie-${idMovie.value}`,
        () => $fetch('/api/tmdb/movie', {
            query: {
                id: idMovie.value
            }
        }))

    const {data: credits, pending: creditsPending} = useAsyncData<TmdbMovieDetails>(`movie-credits-${idMovie.value}`,
        () => $fetch('/api/tmdb/credits', {
            query: {
                id: idMovie.value
            }
        }))

    const trailer = computed(() => {
        return data.value?.trailers?.find(
            trailer =>
                trailer.site === 'YouTube' &&
                trailer.type === 'Trailer'
        )
    })

    const image = computed(() => {

        const path =
            data.value?.poster_path ||
            data.value?.backdrop_path

        return path
            ? `https://image.tmdb.org/t/p/original${path}`
            : '/assets/errorImageMovie/errorImage.jpg'
    })

    const handleAddMovie = () => {


        if (!data.value) return

        movieStore.createMovie(
            mapTmdbMovie(data.value)
        )
    }

    const crewConverter = computed(() => {

        return credits.value?.crew?.filter(
            crew => crew.profile_path ? crew.job === "Director" : false
        )
    })

    const castConverter = computed(() => {

        return credits.value?.cast?.filter(
            actor => actor.profile_path ? actor.order <= 50 : false
        )
    })


    return {
        handleAddMovie,
        crewConverter,
        castConverter,
        trailer,
        image,
        data,
        pending,
        creditsPending,
        credits,
    }
}

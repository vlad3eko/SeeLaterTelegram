import type {TmdbMovieDetails} from "~/types/tmdb.types";

export const useMovieDetails = () => {

    const movieStore = useMovieStore()

    const route = useRoute()
    const slug = route.params.slug
    const media = route.params.media
    console.log('route', route)

    const idMovie = computed(() => {
        return String(slug).split('-')[0]
    })

    const {data, pending} = useAsyncData<TmdbMovieDetails>(`movie-${idMovie.value}`,
        () => $fetch('/api/tmdb/movie', {
            query: {
                id: idMovie.value,
                media
            }
        }))

    const {data: credits, pending: creditsPending} = useAsyncData<TmdbMovieDetails>(`movie-credits-${idMovie.value}`,
        () => $fetch('/api/tmdb/credits', {
            query: {
                id: idMovie.value,
                media
            }
        }))

    const trailer = computed(() => {
        return data.value?.trailers?.find(
            trailer =>
                trailer.site === 'YouTube' &&
                trailer.type === 'Trailer'
        )
    })

    const handleAddMovie = () => {


        if (!data.value) return

        movieStore.createMovie(
            mapTmdbMovie(data.value)
        )

        console.log('useMovieDetails data', data)
    }

    const isDirector = computed(() => {
        return credits?.value?.crew?.filter(person => person.job === "Director")
    })

    const isProducer = computed(() => {
        return credits?.value?.crew?.filter(person => person.job === "Producer")
    })

    const isExecutiveProducer = computed(() => {
        return credits?.value?.crew?.filter(person => person.job === "Executive Producer")
    })

    const isWriter = computed(() => {
        return credits?.value?.crew?.filter(person => person.job === "Writer")
    })

    const castConverter = computed(() => {

        return credits.value?.cast?.filter(
            actor => actor.profile_path ? actor.order <= 50 : false
        )
    })


    return {
        handleAddMovie,
        isDirector,
        isProducer,
        isExecutiveProducer,
        isWriter,
        castConverter,
        trailer,
        data,
        pending,
        creditsPending,
        credits,
    }
}

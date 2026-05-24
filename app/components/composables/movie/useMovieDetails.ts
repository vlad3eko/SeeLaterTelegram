import type {TmdbMovieDetails} from "~/types/tmdb.types";
import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";
import {filterRoleDirector} from "~/utils/person/role/filterRoleDirector";
import {filterRoleProducer} from "~/utils/person/role/filterRoleProducer";
import {filterRoleWriter} from "~/utils/person/role/filterRoleWriter";
import {filterExecutiveProducer} from "~/utils/person/role/filterExecutiveProducer";

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

    const handleAddMovie = () => {


        if (!data.value) return

        movieStore.createMovie(
            mapTmdbMovie(data.value)
        )
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

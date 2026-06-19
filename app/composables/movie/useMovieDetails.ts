import type {TmdbMovieDetails, TmdbTrailer} from "~/types/tmdb.types";
import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";
import {useMovieStore} from "~/stores/movies.store";
import {mapRoleByMovie} from "~/utils/person/role/mapRoleByMovie";

export const useMovieDetails = () => {

    const movieStore = useMovieStore()

    const route = useRoute()
    const slug = route.params.slug
    const media = route.params.media

    const idMedia = computed(() => {
        return String(slug).split('-')[0]
    })

    const {data, pending} = useAsyncData<TmdbMovieDetails>(`${media}-${idMedia.value}`,
        () => $fetch('/api/tmdb/movie', {
            query: {
                id: idMedia.value,
                media
            }
        }))

    const {data: credits, pending: creditsPending} = useAsyncData<TmdbMovieDetails>(`${media}-credits-${idMedia.value}`,
        () => $fetch('/api/tmdb/credits', {
            query: {
                id: idMedia.value,
                media
            }
        }))

    const crewData = computed(() => {
        return (credits?.value?.crew || []) as TmdbPersonMovieCrew[]
    })

    const trailer = computed(() => {

        return data.value?.trailers?.find(
            trailer =>
                trailer.site === 'YouTube'
                && trailer.type === 'Trailer'
        )
    })

    const handleAddMovie = () => {

        if (!data.value) return
        movieStore.createMovie(
            mapTmdbMovie(data.value)
        )
    }

    const castConverter = computed(() => {
        return credits.value?.cast?.filter(actor => actor.profile_path ? actor.order <= 50 : false)
    })

    const convertCrewSection = computed(() => {
        return mapRoleByMovie(crewData.value)
    })

    return {
        trailer,
        data,
        pending,
        creditsPending,
        credits,
        handleAddMovie,
        castConverter,
        convertCrewSection,
    }
}

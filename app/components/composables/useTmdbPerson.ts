import type {
    TmdbPerson,
    TmdbBaseMovie,
    TmdbPersonMovieCast,
    TmdbPersonMovieCrew
} from "~/types/tmdb.person.types";
import {filterRoleDirector} from "~/utils/person/role/filterRoleDirector";
import {filterRoleProducer} from "~/utils/person/role/filterRoleProducer";
import {filterRoleWriter} from "~/utils/person/role/filterRoleWriter";
import {sortByRating} from "~/utils/movie/sortByRating";
import {filterTheMovie} from "~/utils/movie/filterTheMovie";

export const useTmdbPerson = () => {
    const route = useRoute()

    const personID = computed(() => {
        return String(route.params.id).split('-')[0]
    })

    const {data, pending, refresh} = useAsyncData<TmdbPerson>(`person-${personID.value}`,
        () => $fetch('/api/tmdb/person', {
            query: {
                id: personID.value
            }
        }),
    )

    const awardMovies = computed(() => {
        const biography = data?.value?.biography || ''

        const matches = [
            ...biography.matchAll(/\[(.*?)\]/g)
        ]

        const movieTitle = matches.map(match => match[1])

        return ((data?.value?.combined_credits.cast || []) as TmdbPersonMovieCast[])
            .filter(movie => movieTitle.includes(movie.title))
            .sort(sortByRating)
    })

    const bestMoviesCast = computed(() => {
        return ((data?.value?.combined_credits.cast || []) as TmdbPersonMovieCast[])
            .filter(filterTheMovie)
            .sort(sortByRating)
    })

    const isDirector = computed(() => {
        return ((data?.value?.combined_credits.crew || []) as TmdbPersonMovieCrew[])
            .filter(filterRoleDirector)
    })

    const isProducer = computed(() => {
        return ((data?.value?.combined_credits.crew || []) as TmdbPersonMovieCrew[])
            .filter(filterRoleProducer)
    })

    const isWriter = computed(() => {
        return ((data?.value?.combined_credits.crew || []) as TmdbPersonMovieCrew[])
            .filter(filterRoleWriter)
    })

    return {
        data,
        pending,
        refresh,
        awardMovies,
        bestMoviesCast,
        isDirector,
        isProducer,
        isWriter,
    }
}

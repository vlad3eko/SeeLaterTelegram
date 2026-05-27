import type {
    TmdbPerson,
    TmdbPersonMovieCast,
    TmdbPersonMovieCrew
} from "~/types/tmdb.person.types";
import {sortByRating} from "~/utils/movie/sortByRating";
import {filterTheMovie} from "~/utils/movie/filterTheMovie";
import {getSectionMovieByRole} from "~/utils/movie/getSectionMovieByJob";
import {photoPersonSection} from "~/utils/person/photo/photoPersonSection";

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

    const crewData = computed(() =>
        ((data?.value?.combined_credits.crew) as TmdbPersonMovieCrew[]))

    const images = computed(() =>
        ((data.value?.images.profiles || []) as TmdbPerson[]))

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

    const convertCrewSection = computed(() => {
        return getSectionMovieByRole(crewData.value)
    })

    const convertPersonSection = computed(() => {
        return photoPersonSection(images.value)
    })

    return {
        data,
        pending,
        refresh,
        awardMovies,
        bestMoviesCast,
        convertCrewSection,
        convertPersonSection,
    }
}

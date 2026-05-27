import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";
import {CREW_JOBS} from "~/constants/tmdb/crewJobs";
import {getMovieByJob} from "~/utils/movie/mapMovieByRole";

export const getSectionMovieByRole = (data: TmdbPersonMovieCrew[]) => {

    return CREW_JOBS.map(section => ({
        id: section.id,
        title: section.title,
        items: getMovieByJob(data, section.key)
    })).filter(section => section?.items?.length > 0)
}

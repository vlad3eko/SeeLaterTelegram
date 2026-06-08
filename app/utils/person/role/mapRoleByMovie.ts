import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";
import {CREW_JOBS} from "~/constants/tmdb/crewJobs";
import {getJobByMovie} from "~/utils/person/role/getJobByMovie";

export const mapRoleByMovie = (data: TmdbPersonMovieCrew[]) => {

    return CREW_JOBS.map(section => ({
        id: section.id,
        title: section.title,
        items: getJobByMovie(data, section.key)
    })).filter(section => section?.items?.length > 0)
}

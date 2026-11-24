import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";
import {CREW_JOBS} from "~/constants/tmdb/crewJobs";
import {getJobByMovie} from "~/utils/person/role/getJobByMovie";

/*
 * Порядок групп съёмочной группы на странице тайтла: продюсеры раньше директоров.
 * (Страница персоны использует CREW_JOBS в исходном порядке — её это не касается.)
 */
const TITLE_PAGE_ORDER: Record<string, number> = {
    'Producer': 0,
    'Director': 1,
    'Writer': 2,
    'Executive Producer': 3,
}

export const mapRoleByMovie = (data: TmdbPersonMovieCrew[]) => {

    return CREW_JOBS.map(section => ({
        id: section.id,
        title: section.title,
        order: TITLE_PAGE_ORDER[section.key] ?? 99,
        // Без фото человек на странице тайтла не показывается (как и в актёрском составе).
        items: getJobByMovie(data, section.key).filter(person => person.profile_path)
    }))
        .filter(section => section?.items?.length > 0)
        .sort((a, b) => a.order - b.order)
}

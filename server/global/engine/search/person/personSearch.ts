import {normalizeTmdbMedia} from "~/utils/media/normalizeTmdbMedia";

export const personSearch = (result: any, cacheOptions: any) => {
    result.results = (result.results || [])
        .map(normalizeTmdbMedia)
        .filter((person: any) =>
            person.media_type === "person"
            || person.known_for_department
            || person.character
            || person.job
            || person.credit_id
        )
        .filter((person: any) => Boolean(person.profile_path))
        .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))

    return {
        ...result,

        inlineOptions:
        cacheOptions
    }
}

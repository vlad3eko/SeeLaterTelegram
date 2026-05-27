import type {TmdbPerson} from "~/types/tmdb.person.types";

export const photoPersonSection = (data: TmdbPerson[]) => {
    return data.filter(image => image.file_path)
}

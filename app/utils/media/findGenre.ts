
import {tmdbGenres} from "#server/global/engine/search/mapper/tmdbGenres";
import type {typeRichCard} from "#server/global/engine/card/enum/types";

export const findGenre = (
    genres: string[],
    mediaType: typeRichCard
): number[] => {

    const dictionary: Record<string, number> =
        mediaType === "movie"
            ? { ...tmdbGenres.movie }
            : { ...tmdbGenres.tv }

    return genres
        .map((genre) =>
            dictionary[
                genre
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, "")
                ]
        )
        .filter((id): id is number => id !== undefined)
}

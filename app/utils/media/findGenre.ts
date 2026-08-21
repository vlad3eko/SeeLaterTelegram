import {tmdbGenres} from "#server/global/engine/search/mapper/tmdbGenres";

export const findGenre = (
    genres: string[],
    mediaType: "movie" | "tv" | "person"
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

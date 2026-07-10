import { tmdbGenres } from "~/utils/search/tmdbGenres";

export const findGenre = (
    genres: string[],
    mediaType: "movie" | "tv"
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

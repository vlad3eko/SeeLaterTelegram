import {TmdbGenre} from "~/types/tmdb.types";

let movieGenres = new Map<number, string>()
let tvGenres = new Map<number, string>()

export async function loadGenres() {

    if (movieGenres.size && tvGenres.size) {
        return
    }

    const [movie, tv] = await Promise.all([
        $fetch<{ genres: TmdbGenre[] }>('/api/tmdb/genres', {
            query: { media: 'movie' }
        }),
        $fetch<{ genres: TmdbGenre[] }>('/api/tmdb/genres', {
            query: { media: 'tv' }
        })
    ])

    movieGenres = new Map(
        (movie.genres ?? [])
            .map(g => [g.id, g.name])
    )

    tvGenres = new Map(
        (tv.genres ?? [])
            .map(g => [g.id, g.name])
    )
}

export function getGenreNames(ids: number[], mediaType: string) {

    const map =
        mediaType === 'tv'
            ? tvGenres
            : movieGenres

    return ids.map(id => ({
        id,
        name: map.get(id) ?? 'Неизвестно'
    }))
}

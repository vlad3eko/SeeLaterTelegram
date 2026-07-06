import type {TmdbGenre} from "~/types/tmdb.types";

export const processSearchMediaInline = async (ctx: any, medias: any) => {

    const results = medias.results.map((media: any) => ({
        type: 'article',
        tmdb_id: media.id,
        poster: media.poster_path || media.backdrop_path,
        title: media.title || media.name,
        media_type: media.media_type,
        genres: media.genre_ids,
        overview: media.overview,
        count: media.vote_count,
        vote: media.vote_average,
    }))

    console.log('results', results)
}

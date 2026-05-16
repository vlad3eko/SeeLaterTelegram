// import type {Movie, MovieStatus} from "~/types/movie.types";
// import type {TmdbMovieDetails} from "~/types/tmdb.types"
//
// export interface MovieCardModel {
//     id: number
//     title: string
//     description: string
//     poster_path: string | undefined
//     backdrop_path?: string | undefined
//     rating: number | string | null
//     release_date?: string
//     status?: MovieStatus
//     tmdb_id?: number
//     source: 'tmdb' | 'local'
// }
//
//
// export const mapTmdbMovie = (movie: TmdbMovieDetails): Movie => {
//
//     return {
//         id: movie.id,
//         title: movie.title,
//         description: movie.overview,
//         posters: {
//             poster_path: movie.poster_path,
//             backdrop_path: movie.backdrop_path
//         },
//         rating: movie.vote_average,
//         release_date: movie.release_date,
//         status: 'planned',
//         tmdb_id: movie.id,
//         source: 'tmdb'
//     }
// }
//
// export const mapLocalMovie = (movie: Movie): MovieCardModel => {
//
//     return {
//         id: movie.id,
//         title: movie.title,
//         description: movie.description,
//         poster_path: movie.posters?.poster_path,
//         backdrop_path: movie.posters?.backdrop_path,
//         rating: movie.rating,
//         release_date: movie.release_date,
//         status: movie.status,
//         tmdb_id: movie.tmdb_id,
//         source: 'local'
//     }
// }

export const filterTheMovie = (movie: any) => {
    return (
        movie.media_type === 'movie'
        && movie.overview
        && (movie.backdrop_path || movie.poster_path)
    )
}

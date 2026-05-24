export const imageCheck = (data: Record<string, any> | undefined) => {

    if (!data) return '/assets/errorImageMovie/errorImage.jpg'

    const variant = (data.poster_path || data.profile_path || data.file_path || data.backdrop_path)

    return variant
        ? `https://image.tmdb.org/t/p/w300${variant}`
        : '/assets/errorImageMovie/errorImage.jpg'

}

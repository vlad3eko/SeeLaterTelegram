export const normalizeTmdbMedia = (media: any) => {

    return {

        ...media,

        title:
            media.title || media.name,

        release_date:
            media.release_date || media.first_air_date,

        poster_path:
            media.poster_path || media.backdrop_path
    }

}

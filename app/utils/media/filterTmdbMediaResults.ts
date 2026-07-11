export const filterTmdbMediaResults = (
    media:any
)=>{

    return (
        media.media_type === "movie" ||
        media.media_type === "tv"
    )

}

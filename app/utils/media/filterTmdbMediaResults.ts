export const filterTmdbMediaResults = (
    results:any[]
)=>{

    return results.filter(
        item =>
            item.media_type === "movie" ||
            item.media_type === "tv"
    )

}

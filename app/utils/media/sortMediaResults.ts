export const sortMediaResults = (medias:any[])=>{

    const today = new Date().getTime()

    const enriched = medias.map(item=>{

            const date = item.release_date || item.first_air_date

            const releaseDate =
                new Date(date || 0)
                    .getTime()

            return {
                ...item,
                _vote: item.vote_count || 0,

                _date: releaseDate,

                _isUnreleased: releaseDate > today
            }
        })


    const topRanked =
        [...enriched]
            .sort(
                (a,b)=>
                    b._vote - a._vote
            ).slice(0,3)


    const topIds = new Set(topRanked.map(i=>i.id))

    const unreleased =
        enriched
            .filter(
                media =>
                    media._isUnreleased &&
                    !topIds.has(media.id)
            )
            .sort(
                (a,b)=>
                    b._vote-a._vote
            )

    const others =
        enriched
            .filter(
                media =>
                    !media._isUnreleased &&
                    !topIds.has(media.id)
            )
            .sort(
                (a,b)=>
                    b._vote-a._vote
            )

    return [
        ...unreleased,
        ...topRanked,
        ...others
    ]
}

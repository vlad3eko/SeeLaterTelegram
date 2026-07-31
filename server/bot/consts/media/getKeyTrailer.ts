export const getKeyTrailer = (trailers: any) => {
    let trailer
    if (!trailers) {
        trailer = []
    } else {
        trailer = trailers.trailers.filter((type: any) => {
            return type.type === 'Trailer'
        })
    }
    return trailer.length ? trailer[0]?.key : undefined
}

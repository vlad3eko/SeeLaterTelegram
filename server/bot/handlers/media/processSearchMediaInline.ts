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

        input_message_content: {
            message_text: media.title || media.name
        }
    }))

    await ctx.answerInlineQuery(results)
    console.log('results', results)
}

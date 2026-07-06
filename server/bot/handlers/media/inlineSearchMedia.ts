export const inlineSearchMedia = async (ctx: any) => {
    const query = ctx.inlineQuery.query

    const medias = await $fetch(
        '/api/tmdb/search',
        {
            query: {
                q: query,
            }
        }
    )

    console.log('medias', medias)
}

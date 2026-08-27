export const processInlineSearch = async (
    ctx: any,
    results: any
) => {

    const nextOffset =
        results.page < results.total_pages
            ? String(results.page + 1)
            : ''

    try {

        await ctx.answerInlineQuery(
            results.results,
            {
                button: {
                    text: '🔍 Расширенный поиск',
                    start_parameter: 'inline_settings'
                },

                ...results.inlineOptions,

                next_offset: nextOffset
            }
        )


    } catch (error: any) {

        const description =
            error?.response?.description || ''

        if (description.includes('query is too old')
            || description.includes('response timeout expired')
            || description.includes('query ID is invalid')) {
            return
        }

        console.error('[INLINE QUERY ERROR]', error)
    }
}

export const processInlineSearch = async (
    ctx: any,
    results: any
) => {

    try {

        const nextOffset =
            results.page < results.total_pages
                ? String(results.page + 1)
                : ''

        console.log(
            'inline pagination:',
            {
                page: results.page,
                total_pages: results.total_pages,
                next_offset: nextOffset
            }
        )

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

        const errorMessage =
            error?.response?.description
        if (errorMessage.includes('400: ')) {
            return
        }

        console.error(
            'Ошибка process:',
            error
        )

        await ctx.answerInlineQuery([])
    }
}

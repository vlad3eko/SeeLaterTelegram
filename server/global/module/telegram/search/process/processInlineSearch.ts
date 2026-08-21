export const processInlineSearch = async (ctx: any, results: any) => {
    try {
        await ctx.answerInlineQuery(results, {
            button: {
                text: '🔍 Расширенный поиск',
                start_parameter: 'inline_settings'
            },
            ...results.inlineOptions,
            next_offset: results.page < results.total_pages ? String(results.page + 1) : ''
        })

    } catch (e) {
        console.log('Ошибка process:', e)
        await ctx.answerInlineQuery([])
    }
}

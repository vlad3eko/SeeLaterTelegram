import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";

export const checkInlineQuery = async (ctx: any) => {

    const isCollection =
        ctx.inlineQuery.query.includes('#collection')

    return await ctx.answerInlineQuery([
        {
            type: 'article',

            id: isCollection
                ? 'empty_collection'
                : 'no_search_results',

            title: isCollection
                ? 'Сохранённых фильмов пока нет'
                : 'Ничего не найдено',

            description: isCollection
                ? 'Добавьте фильм или сериал в свою коллекцию'
                : 'Попробуйте изменить поисковый запрос',

            input_message_content: {
                message_text:
                    'message: Ищите популярные новинки кино и сериалов'
            },

            reply_markup: keyboardSearchBot()
        }
    ], {
        cache_time: 0
    })
}

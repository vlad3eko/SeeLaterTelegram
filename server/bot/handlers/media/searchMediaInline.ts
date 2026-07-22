import {processSearchMediaInline} from "#server/bot/handlers/media/processSearchMediaInline";
import {searchMedia} from "~/utils/search/searchMedia";
import {parseSearchQuery} from "~/utils/search/parseSearchQuery";
import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";

export const searchMediaInline = async (ctx: any) => {

    const query = ctx.inlineQuery.query.trim()

    const parsed = parseSearchQuery(
        query,
        ctx.from.id
    )

    const hasTags =
        parsed.filters.genres.length > 0 ||
        parsed.filters.mediaTypes.length > 0

    const hasText =
        parsed.text.length === 0 || parsed.text.length >= 3

    if (!hasTags && !hasText) {
        return await ctx.answerInlineQuery([])
    }

    try {
        const page = Number(ctx.inlineQuery.offset) || 1
        const medias = await searchMedia(ctx.inlineQuery.query, page, ctx.from.id)

        console.log('medias.results', medias.results[0])
        if (!medias.results?.length) {

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
                            'Ищите популярные новинки кино и сериалов'
                    },

                    reply_markup: keyboardSearchBot()
                }
            ], {
                cache_time: 0
            })
        }
        await processSearchMediaInline(ctx, medias)

    } catch (error) {
        console.error("inline search error:", error)
        await ctx.answerInlineQuery([])
    }
}

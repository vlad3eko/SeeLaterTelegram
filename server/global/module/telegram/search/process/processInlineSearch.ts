import { FormatDate, FormatRating } from "~/utils/formatMoviesData"
import { keyboardSendMediaCardInline } from "#server/bot/consts/buttons/keyboardBot"
import { genresConvert } from "~/utils/convert/genresConvert"
import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment"
import {contentTypeConvert} from "~/utils/convert/contentTypeConvert";

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

import {searchType} from "#server/global/module/telegram/search/helpers/searchType";
import {processInlineSearch} from "#server/global/module/telegram/search/process/processInlineSearch";
import {checkInlineQuery} from "#server/bot/consts/checkInlineQuery";

export type options = 'web' | 'telegram'

export const executeProcessSearch = async (medias: any, options: options, ctx: any | undefined) => {

    if (!medias.results?.length) return await checkInlineQuery(ctx)

    switch (options) {
        case "web":
            return

        case "telegram":
            const results = searchType(medias)

            await processInlineSearch(ctx, results)
    }
}

import {searchType} from "#server/global/module/telegram/search/helpers/searchType";
import {processInlineSearch} from "#server/global/module/telegram/search/process/processInlineSearch";

export type options = 'web' | 'telegram'

export const executeProcessSearch = async (obj: any, options: options, ctx: any | undefined) => {
    switch (options) {
        case "web":
            return

        case "telegram":
            const results = searchType(obj)

            await processInlineSearch(ctx, results)
    }
}

import {executeSearchStrategy} from "~/utils/search/strategy/executeSearchStrategy";
import {resolveSearchStrategy} from "~/utils/search/strategy/resolveSearchStrategy";
import {normalizeSearchQuery} from "~/utils/search/normalizeSearchQuery";
import {parseSearchQuery} from "~/utils/search/parseSearchQuery";
import {filterTmdbMediaResults} from "~/utils/media/filterTmdbMediaResults";


export const searchMedia = async (
    input:string
)=>{

    const parsedQuery = parseSearchQuery(input)

    const normalizedQuery = normalizeSearchQuery(parsedQuery)

    const strategy = resolveSearchStrategy(normalizedQuery)

    const result:any = await executeSearchStrategy(strategy, normalizedQuery)
    result.results = filterTmdbMediaResults(result.results)
    return result

}

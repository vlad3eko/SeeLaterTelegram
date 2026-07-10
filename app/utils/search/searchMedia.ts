import {parseSearchQuery} from "./parseSearchQuery";

import {normalizeSearchQuery} from "./normalizeSearchQuery";
import {resolveSearchStrategy} from "./strategy/resolveSearchStrategy";
import {executeSearchStrategy} from "./strategy/executeSearchStrategy";


export const searchMedia = async (
    input: string
) => {
    // 1. Разбираем текст пользователя
    const parsedQuery = parseSearchQuery(input)

    // 2. Преобразуем пользовательские фильтры
    // в формат для TMDB
    const normalizedQuery = normalizeSearchQuery(parsedQuery)

    // 3. Определяем способ поиска
    const strategy = resolveSearchStrategy(normalizedQuery)

    // 4. Выполняем поиск
    return await executeSearchStrategy(strategy, normalizedQuery)

}

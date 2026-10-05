import {engineSearch} from "#server/global/engine/search/engineSearch";

export async function fetchPages(userId: number, pagesFetch: number): Promise<any[]> {
    const promises = [];

    // Запускаем 10 запросов параллельно (страницы 1-10)
    for (let i = 1; i <= pagesFetch; i++) {
        promises.push(engineSearch('(2026)', i, userId));
    }

    const pages = await Promise.all(promises);
    const results: any[] = [];

    // Собираем все фильмы в один плоский массив
    for (const page of pages) {
        if (page && Array.isArray(page.results)) {
            results.push(...page.results);
        }
    }

    return results;
}

/**
 * Кадры «актёр в этом фильме» для подборки лучших фильмов именинника (пост «день рождения»).
 * Поиск картинок Brave Search API (ключ BRAVE_SEARCH_API_KEY; $5 бесплатных кредитов в месяц —
 * это 1000 запросов, один запрос на фильм). Без ключа ничего не ищется — в списке кадр TMDB.
 *
 * Постеры отсеиваются по форме (кадр горизонтальный, постер вертикальный) и по словам в
 * названии и адресе (poster, wallpaper, fan art…). Сначала берётся оригинал картинки, запасной —
 * её копия 500 px через прокси Brave (Telegram скачивает её надёжнее, чем с чужого сайта).
 */

const ENDPOINT = 'https://api.search.brave.com/res/v1/images/search'
/** Горизонтальный кадр: ширина хотя бы в 1.3 раза больше высоты (16:9 = 1.78, постер ≈ 0.67). */
const MIN_RATIO = 1.3
/** Оригинал меньше — мутный кадр, лучше копия с прокси или следующий результат. */
const MIN_WIDTH = 600
const NOT_A_STILL = /poster|постер|wallpaper|обои|fan[\s_-]?art|fanart|collage|коллаж|cover|обложк|dvd|blu[\s_-]?ray|vhs|logo|soundtrack|premiere|red[\s_-]?carpet|interview|press[\s_-]?conference|getty/i

type BraveImage = {
    title?: string
    url?: string
    thumbnail?: {src?: string, width?: number, height?: number}
    properties?: {url?: string, width?: number, height?: number}
}

/** Запрос: «Meg Ryan When Harry Met Sally 1989 movie still». */
export const stillQuery = (actor: string, film: string, year?: number | null) =>
    `${actor} ${film}${year ? ` ${year}` : ''} movie still`

const ratioOf = (image: BraveImage) => {
    const width = Number(image.properties?.width ?? image.thumbnail?.width) || 0
    const height = Number(image.properties?.height ?? image.thumbnail?.height) || 0
    return width && height ? width / height : undefined
}

/**
 * Ответ Brave → ссылки для загрузки, лучшие первыми: на каждый подходящий результат — оригинал
 * (если крупный) и копия с прокси. Картинки неизвестной формы — после горизонтальных.
 */
export const pickStills = (body: {results?: BraveImage[]}, limit = 3): string[] => {
    const known: BraveImage[] = []
    const unknown: BraveImage[] = []
    for (const image of body.results ?? []) {
        const text = `${image.title ?? ''} ${image.url ?? ''} ${image.properties?.url ?? ''}`
        if (NOT_A_STILL.test(text)) continue
        const ratio = ratioOf(image)
        if (ratio === undefined) unknown.push(image)
        else if (ratio >= MIN_RATIO) known.push(image)
    }
    const urls: string[] = []
    for (const image of [...known, ...unknown].slice(0, limit)) {
        const original = image.properties?.url
        const width = Number(image.properties?.width) || 0
        if (original?.startsWith('https://') && (!width || width >= MIN_WIDTH)) urls.push(original)
        if (image.thumbnail?.src) urls.push(image.thumbnail.src)
    }
    return [...new Set(urls)]
}

export const hasStillSearch = (env: NodeJS.ProcessEnv = process.env) => Boolean(env.BRAVE_SEARCH_API_KEY?.trim())

/** Кадры фильма с актёром: ссылки по порядку (пусто — не нашлось или нет ключа). */
export const searchStills = async (
    actor: string,
    film: string,
    year?: number | null,
    {key = process.env.BRAVE_SEARCH_API_KEY?.trim(), fetchImpl = fetch}: {key?: string, fetchImpl?: typeof fetch} = {}
): Promise<string[]> => {
    if (!key) return []
    const params = new URLSearchParams({
        q: stillQuery(actor, film, year),
        count: '20',
        safesearch: 'strict',
        search_lang: 'en',
        country: 'US',
        spellcheck: 'false'
    })
    const response = await fetchImpl(`${ENDPOINT}?${params}`, {
        headers: {Accept: 'application/json', 'X-Subscription-Token': key},
        signal: AbortSignal.timeout(15_000)
    })
    if (!response.ok) throw new Error(`Brave ${response.status}`)
    return pickStills(await response.json())
}

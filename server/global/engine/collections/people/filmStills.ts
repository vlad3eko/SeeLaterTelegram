/**
 * Кадры «актёр в этом фильме» для подборки лучших фильмов именинника (пост «день рождения»).
 * Поиск картинок Brave Search API (ключ BRAVE_SEARCH_API_KEY; $5 бесплатных кредитов в месяц —
 * это 1000 запросов, один запрос на фильм). Без ключа ничего не ищется — в списке кадр TMDB.
 *
 * Постеры отсеиваются по форме (кадр горизонтальный, постер вертикальный) и по словам в
 * названии и адресе (poster, wallpaper, fan art…), фото с водяными знаками — по сайту (eBay, фотобанки).
 * Берутся только оригиналы: копия 500 px с прокси Brave после растягивания до 1280×720 мыльная.
 * Дальше normalizeStill проверяет настоящий размер и приводит кадр к 1280×720.
 */

const ENDPOINT = 'https://api.search.brave.com/res/v1/images/search'
/** Горизонтальный кадр: ширина хотя бы в 1.3 раза больше высоты (16:9 = 1.78, постер ≈ 0.67). */
const MIN_RATIO = 1.3
/** Оригинал уже этого (если Brave знает ширину) не берём — после растягивания мутный. */
const MIN_WIDTH = 1100
const NOT_A_STILL = /poster|постер|wallpaper|обои|fan[\s_-]?art|fanart|collage|коллаж|cover|обложк|dvd|blu[\s_-]?ray|vhs|logo|soundtrack|premiere|red[\s_-]?carpet|interview|press[\s_-]?conference|getty/i
/** Сайты с водяными знаками и подписями на фото (живая проверка 19.11: пресс-фото с eBay с надписью Historic Images). */
const WATERMARKED = /ebayimg|ebay\.|historicimages|alamy|shutterstock|dreamstime|istockphoto|depositphotos|123rf|bigstock|agefotostock|mediastorehouse|worthpoint/i

type BraveImage = {
    title?: string
    url?: string
    thumbnail?: {src?: string, width?: number, height?: number}
    properties?: {url?: string, width?: number, height?: number}
}

/** Имя персонажа для запроса: «Jane / Narrator (voice)» → «Jane»; пусто — без персонажа. */
export const characterName = (character?: string | null) =>
    String(character ?? '').split('/')[0]!.replace(/\(.*?\)/g, '').replace(/["«»]/g, '').trim()

/**
 * Точный запрос: «"Meg Ryan" as Lydia Maxwell "Innerspace" 1987 film still». Имя персонажа и кавычки
 * (живая проверка 19.11 на четырёх фильмах): по «Meg Ryan Innerspace 1987 movie still» первым был
 * Мартин Шорт, а Мег Райан — краем кадра; с персонажем — она крупно. Без персонажа — простой запрос.
 */
export const stillQuery = (actor: string, film: string, year?: number | null, character?: string | null) => {
    const role = characterName(character)
    const when = year ? ` ${year}` : ''
    return role ? `"${actor}" as ${role} "${film}"${when} film still` : `${actor} ${film}${when} movie still`
}

const ratioOf = (image: BraveImage) => {
    const width = Number(image.properties?.width ?? image.thumbnail?.width) || 0
    const height = Number(image.properties?.height ?? image.thumbnail?.height) || 0
    return width && height ? width / height : undefined
}

/**
 * Ответ Brave → ссылки на оригиналы для загрузки, по порядку выдачи: сначала крупные
 * горизонтальные, затем неизвестного размера (их размер проверит normalizeStill).
 */
export const pickStills = (body: {results?: BraveImage[]}, limit = 6): string[] => {
    const known: BraveImage[] = []
    const unknown: BraveImage[] = []
    for (const image of body.results ?? []) {
        const text = `${image.title ?? ''} ${image.url ?? ''} ${image.properties?.url ?? ''}`
        if (NOT_A_STILL.test(text) || WATERMARKED.test(text)) continue
        const ratio = ratioOf(image)
        const original = image.properties?.url
        const width = Number(image.properties?.width) || 0
        if (!original?.startsWith('https://') || (width && width < MIN_WIDTH)) continue
        if (ratio === undefined) unknown.push(image)
        else if (ratio >= MIN_RATIO) known.push(image)
    }
    return [...new Set([...known, ...unknown].map(image => image.properties!.url!))].slice(0, limit)
}

export const hasStillSearch = (env: NodeJS.ProcessEnv = process.env) => Boolean(env.BRAVE_SEARCH_API_KEY?.trim())

/**
 * Кадры фильма с актёром: ссылки по порядку (пусто — не нашлось или нет ключа). С персонажем —
 * сначала точный запрос; ничего не подошло — второй, простой (лишний запрос только в этом случае).
 */
export const searchStills = async (
    actor: string,
    film: string,
    year?: number | null,
    options: StillSearchOptions = {}
): Promise<string[]> => await findStill(actor, film, year, async urls => urls, options) ?? []

type StillSearchOptions = {key?: string, fetchImpl?: typeof fetch, character?: string | null}

/**
 * Найти кадр: ссылки каждого запроса (точный, затем простой) отдаются в use — первая принятая
 * (use вернул не undefined) — ответ. Простой запрос идёт, только если по точному ничего не нашлось
 * или ни одна картинка не подошла (живая проверка 19.11: «Французский поцелуй» — по точному одна
 * мелкая картинка).
 */
export const findStill = async <T>(
    actor: string,
    film: string,
    year: number | null | undefined,
    use: (urls: string[]) => Promise<T | undefined>,
    {key = process.env.BRAVE_SEARCH_API_KEY?.trim(), fetchImpl = fetch, character}: StillSearchOptions = {}
): Promise<T | undefined> => {
    if (!key) return undefined
    const queries = characterName(character) ? [stillQuery(actor, film, year, character), stillQuery(actor, film, year)] : [stillQuery(actor, film, year)]
    for (const query of queries) {
        const urls = await braveStills(query, key, fetchImpl)
        if (!urls.length) continue
        const found = await use(urls)
        if (found !== undefined) return found
    }
    return undefined
}

const braveStills = async (query: string, key: string, fetchImpl: typeof fetch): Promise<string[]> => {
    const params = new URLSearchParams({
        q: query,
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

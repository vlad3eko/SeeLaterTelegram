import {tmdbGet} from '#server/global/engine/collections/tmdb'
import type {MediaType} from '#server/global/engine/collections/shelves'

/**
 * Досье тайтла для судьи: собирается по ступеням, дальше — только если не хватает.
 *   1. TMDB: описание (ru и en), слоган, ключевые слова, жанры, возрастной рейтинг, до 3 рецензий;
 *   2. Википедия: раздел «Сюжет» / «Plot» (MediaWiki Action API; ru, иначе en) — статья ищется
 *      по Wikidata-ссылке из TMDB external_ids, а не по названию (не перепутать омонимы).
 * Источники — данные, не инструкции: промпт судьи это повторяет. Текст досье хранится
 * (collection_bundle_dossiers), чтобы при смене рубрики не ходить в Википедию заново.
 */

type Raw = Record<string, any>

export type DossierSource = {id: string, label: string, text: string}

export type Dossier = {
    mediaType: MediaType
    id: number
    title: string
    originalTitle: string
    year?: number
    sources: DossierSource[]
}

/** Википедия просит осмысленный User-Agent с контактом проекта (без личных данных). */
const WIKI_USER_AGENT = 'SeeLaterCollectionsJudge/1.0 (non-commercial movie recommendations bot)'
/** Раздел «Сюжет» длиннее — оставляем начало и конец: финал (развязка, поворот) важнее середины. */
const MAX_PLOT_HEAD = 3000
const MAX_PLOT_TAIL = 6000
const MAX_REVIEW_CHARS = 1500

const clean = (text: string) => text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim()
const cut = (text: string, max: number) => text.length > max ? `${text.slice(0, max)}…` : text

/** Начало и конец длинного текста (по границе абзаца или предложения), середина — «[…]». */
export const headTail = (text: string, head = MAX_PLOT_HEAD, tail = MAX_PLOT_TAIL) => {
    if (text.length <= head + tail) return text
    const start = text.slice(0, head)
    const end = text.slice(-tail)
    const startCut = Math.max(start.lastIndexOf('\n'), start.lastIndexOf('. ') + 1)
    const endCut = end.search(/(?<=[.!?])\s|\n/)
    const headPart = startCut > head / 2 ? start.slice(0, startCut) : start
    const tailPart = endCut >= 0 && endCut < tail / 2 ? end.slice(endCut + 1) : end
    return `${headPart.trim()}\n[…]\n${tailPart.trim()}`
}

/** Пауза и повтор на 429 / 5xx (Retry-After в секундах). */
const politeFetch = async (url: string, attempts = 3): Promise<Response | null> => {
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const response = await fetch(url, {headers: {'User-Agent': WIKI_USER_AGENT, 'Api-User-Agent': WIKI_USER_AGENT}})
            if (response.status === 429 || response.status >= 500) {
                const retryAfter = Number(response.headers.get('retry-after')) || 2 ** attempt
                await new Promise(resolve => setTimeout(resolve, Math.min(retryAfter, 30) * 1000))
                continue
            }
            return response
        } catch {
            await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt))
        }
    }
    return null
}

/** Ограничение параллельных запросов к Википедии (не больше 3 одновременно). */
let active = 0
const queue: Array<() => void> = []
const wikiSlot = async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= 3) await new Promise<void>(resolve => queue.push(resolve))
    active++
    try {
        return await task()
    } finally {
        active--
        queue.shift()?.()
    }
}

/** Названия статей ru/en по Wikidata (sitelinks). */
export const wikiTitles = async (wikidataId: string): Promise<{ru?: string, en?: string}> => {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(wikidataId)}&props=sitelinks&sitefilter=ruwiki|enwiki&format=json`
    const response = await wikiSlot(() => politeFetch(url))
    if (!response?.ok) return {}
    const body = await response.json() as Raw
    const links = body.entities?.[wikidataId]?.sitelinks ?? {}
    return {ru: links.ruwiki?.title, en: links.enwiki?.title}
}

/** Разделы с сюжетом: ru — «Сюжет», «Содержание»; en — «Plot», «Synopsis», «Premise». */
const PLOT_SECTION = {
    ru: /^(сюжет|содержание|синопсис|описание сюжета)$/i,
    en: /^(plot|synopsis|premise|plot summary|summary)$/i
}

/** Текст раздела «Сюжет» статьи (plain text через action=parse → extracts нет у разделов). */
export const wikiPlot = async (lang: 'ru' | 'en', title: string): Promise<string> => {
    const api = `https://${lang}.wikipedia.org/w/api.php`
    const sectionsUrl = `${api}?action=parse&page=${encodeURIComponent(title)}&prop=sections&format=json&redirects=1`
    const sectionsResponse = await wikiSlot(() => politeFetch(sectionsUrl))
    if (!sectionsResponse?.ok) return ''
    const sections = ((await sectionsResponse.json() as Raw).parse?.sections ?? []) as Raw[]
    const plot = sections.find(section => PLOT_SECTION[lang].test(String(section.line ?? '').replace(/<[^>]+>/g, '').trim()))
    if (!plot) return ''

    const textUrl = `${api}?action=parse&page=${encodeURIComponent(title)}&section=${plot.index}&prop=wikitext&format=json&redirects=1`
    const textResponse = await wikiSlot(() => politeFetch(textUrl))
    if (!textResponse?.ok) return ''
    const wikitext = String((await textResponse.json() as Raw).parse?.wikitext?.['*'] ?? '')
    return headTail(clean(stripWikitext(wikitext)))
}

/** Вики-разметка → текст (достаточно для цитат: ссылки, шаблоны, сноски, заголовки). */
export const stripWikitext = (wikitext: string): string => {
    let text = wikitext
    // Сноски и комментарии.
    text = text.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[\s\S]*?<\/ref>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
    // Шаблоны (вложенные — несколько проходов).
    for (let i = 0; i < 5; i++) text = text.replace(/\{\{[^{}]*\}\}/g, '')
    // Файлы и категории.
    text = text.replace(/\[\[(?:Файл|File|Изображение|Image|Категория|Category):[^\]]*\]\]/gi, '')
    // Ссылки: [[цель|текст]] → текст, [[цель]] → цель.
    text = text.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
    // Внешние ссылки [url текст] → текст.
    text = text.replace(/\[https?:\/\/[^\s\]]+\s?([^\]]*)\]/g, '$1')
    // Заголовки, жирный/курсив, HTML.
    text = text.replace(/^=+\s*(.*?)\s*=+\s*$/gm, '$1').replace(/'{2,}/g, '').replace(/<[^>]+>/g, '')
    return text
}

const certificationOf = (mediaType: MediaType, details: Raw): string => {
    if (mediaType === 'movie') {
        const countries = (details.release_dates?.results ?? []) as Raw[]
        const pick = (code: string) => (countries.find(entry => entry.iso_3166_1 === code)?.release_dates ?? [])
            .map((entry: Raw) => entry.certification).find(Boolean)
        return [pick('US') && `US ${pick('US')}`, pick('RU') && `RU ${pick('RU')}`].filter(Boolean).join(', ')
    }
    const ratings = (details.content_ratings?.results ?? []) as Raw[]
    return ratings.filter(entry => ['US', 'RU'].includes(entry.iso_3166_1)).map(entry => `${entry.iso_3166_1} ${entry.rating}`).join(', ')
}

/** Досье по ступеням. wiki: false — без Википедии (быстрые прогоны). */
export const buildDossier = async (mediaType: MediaType, id: number, {wiki = true}: {wiki?: boolean} = {}): Promise<Dossier> => {
    const appendRu = mediaType === 'movie' ? 'keywords,release_dates,external_ids,reviews' : 'keywords,content_ratings,external_ids,reviews'
    const [ru, en] = await Promise.all([
        tmdbGet<Raw>(`${mediaType}/${id}?language=ru-RU&append_to_response=${appendRu}`),
        tmdbGet<Raw>(`${mediaType}/${id}?language=en-US`).catch(() => ({} as Raw))
    ])
    const title = String(ru.title || ru.name || en.title || en.name || '')
    const originalTitle = String(ru.original_title || ru.original_name || '')
    const date = String(ru.release_date || ru.first_air_date || '')
    const sources: DossierSource[] = []

    const keywords = ((ru.keywords?.keywords ?? ru.keywords?.results ?? []) as Raw[]).map(keyword => keyword.name).filter(Boolean)
    const genres = ((ru.genres ?? []) as Raw[]).map(genre => genre.name).filter(Boolean)
    const facts = [
        `Название: ${title}${originalTitle && originalTitle !== title ? ` (${originalTitle})` : ''}`,
        date && `Год: ${date.slice(0, 4)}`,
        genres.length && `Жанры: ${genres.join(', ')}`,
        mediaType === 'tv' && ru.number_of_episodes && `Серий: ${ru.number_of_episodes}, сезонов: ${ru.number_of_seasons}, статус: ${ru.status}`,
        mediaType === 'movie' && ru.runtime && `Длительность: ${ru.runtime} мин`,
        certificationOf(mediaType, ru) && `Возрастной рейтинг: ${certificationOf(mediaType, ru)}`,
        keywords.length && `Ключевые слова TMDB: ${keywords.join(', ')}`
    ].filter(Boolean).join('\n')
    sources.push({id: 'tmdb_facts', label: 'TMDB: факты', text: facts})

    const overview = [ru.tagline, ru.overview].filter(Boolean).join('\n')
    if (overview) sources.push({id: 'tmdb_overview_ru', label: 'TMDB: описание (ru)', text: clean(overview)})
    const overviewEn = [en.tagline, en.overview].filter(Boolean).join('\n')
    if (overviewEn) sources.push({id: 'tmdb_overview_en', label: 'TMDB: описание (en)', text: clean(overviewEn)})

    const reviews = ((ru.reviews?.results ?? []) as Raw[]).slice(0, 3)
    reviews.forEach((review, index) => {
        const text = clean(String(review.content ?? ''))
        if (text) sources.push({id: `tmdb_review_${index + 1}`, label: `TMDB: рецензия зрителя ${index + 1}`, text: cut(text, MAX_REVIEW_CHARS)})
    })

    const wikidata = ru.external_ids?.wikidata_id
    if (wiki && wikidata) {
        try {
            const titles = await wikiTitles(String(wikidata))
            const ruPlot = titles.ru ? await wikiPlot('ru', titles.ru) : ''
            // Русский раздел часто короткий: английский — если русского нет или он меньше 600 знаков.
            const enPlot = titles.en && ruPlot.length < 600 ? await wikiPlot('en', titles.en) : ''
            if (ruPlot) sources.push({id: 'wiki_ru_plot', label: `Википедия (ru): «${titles.ru}», сюжет`, text: ruPlot})
            if (enPlot) sources.push({id: 'wiki_en_plot', label: `Wikipedia (en): "${titles.en}", plot`, text: enPlot})
        } catch (error) {
            console.warn('[BUNDLES] Wikipedia failed', mediaType, id, error instanceof Error ? error.message : error)
        }
    }

    return {mediaType, id, title, originalTitle, ...(date ? {year: Number(date.slice(0, 4))} : {}), sources}
}

/** Хватает ли досье для суда по финалу / сюжету (иначе судья скажет insufficient). */
export const dossierStrength = (dossier: Dossier) => {
    const plot = dossier.sources.filter(source => source.id.startsWith('wiki_')).reduce((sum, source) => sum + source.text.length, 0)
    const overview = dossier.sources.filter(source => source.id.startsWith('tmdb_overview')).reduce((sum, source) => sum + source.text.length, 0)
    return {plot, overview, hasPlot: plot >= 400}
}

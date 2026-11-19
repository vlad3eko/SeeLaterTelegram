import {tmdbGet} from '#server/global/engine/collections/tmdb'
import type {HookAward, HookFacts} from '#server/global/engine/instagram/reel/utils/hookFacts'

/**
 * Факты для хука (utils/hookFacts.ts) при создании задачи Reel: один запрос к TMDB (актёры,
 * режиссёр или создатели, серия, сезоны, id в Wikidata) и один к Wikidata (награды самого
 * фильма). Без фактов хук всё равно пишется, поэтому любая ошибка
 * даёт undefined.
 */

const RETURNING_SEASON_DAYS = 240
const WIKIDATA_TIMEOUT_MS = 6_000

const AWARD_BY_LABEL: Array<[RegExp, HookAward]> = [
    [/Academy Award|Oscar/i, 'Оскар'],
    [/Emmy/i, 'Эмми'],
    [/Golden Globe/i, 'Золотой глобус'],
    [/BAFTA|British Academy/i, 'BAFTA'],
    [/Palme d'Or|Cannes/i, 'Каннский фестиваль']
]

type Person = {id: number, name: string}

const sparql = async (query: string): Promise<Array<Record<string, {value: string}>>> => {
    const response = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
        headers: {accept: 'application/sparql-results+json', 'user-agent': 'KinomanovReelBot/1.0'},
        signal: AbortSignal.timeout(WIKIDATA_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error(`[HOOK FACTS] Wikidata ${response.status}`)
    return (await response.json())?.results?.bindings ?? []
}

/** Награды самого фильма или сериала: «получил» (P166) и «номинирован» (P1411). */
const fromWikidata = async (wikidataId: string | undefined): Promise<HookFacts['awards']> => {
    if (!/^Q\d+$/.test(wikidataId ?? '')) return []
    const film = `wd:${wikidataId}`

    const rows = await sparql(`SELECT ?kind ?date ?awardRu ?awardEn WHERE {
        { ${film} p:P166 ?st . ?st ps:P166 ?award . BIND("win" AS ?kind) OPTIONAL { ?st pq:P585 ?date } }
        UNION
        { ${film} p:P1411 ?st . ?st ps:P1411 ?award . BIND("nom" AS ?kind) OPTIONAL { ?st pq:P585 ?date } }
        OPTIONAL { ?award rdfs:label ?awardRu . FILTER(lang(?awardRu) = "ru") }
        OPTIONAL { ?award rdfs:label ?awardEn . FILTER(lang(?awardEn) = "en") }
    }`)

    const awards = new Map<string, HookFacts['awards'][number]>()
    for (const row of rows) {
        const label = row.awardEn?.value ?? ''
        const award = AWARD_BY_LABEL.find(([pattern]) => pattern.test(label))?.[1]
        if (!award || !row.kind) continue
        const won = row.kind.value === 'win'
        const category = row.awardRu?.value || label
        const year = row.date ? Number(row.date.value.slice(0, 4)) || undefined : undefined
        const key = `${won}|${category}`
        if (!awards.has(key)) awards.set(key, {award, won, category, ...(year ? {year} : {})})
    }

    // Сначала победы, затем свежие.
    return [...awards.values()].sort((a, b) => Number(b.won) - Number(a.won) || (b.year ?? 0) - (a.year ?? 0))
}

const isRecent = (date: string | null | undefined, now: number) =>
    !date || Date.parse(date) >= now - RETURNING_SEASON_DAYS * 86_400_000

export const collectHookFacts = async (
    mediaType: string,
    mediaId: number,
    now = Date.now()
): Promise<HookFacts | undefined> => {
    if (mediaType !== 'movie' && mediaType !== 'tv') return undefined

    try {
        const details = await tmdbGet(`${mediaType}/${mediaId}?language=ru-RU&append_to_response=credits,external_ids`)

        const cast: Person[] = [...(details.credits?.cast ?? [])]
            .sort((a: any, b: any) => (a.order ?? 99) - (b.order ?? 99))
            .slice(0, 2)
        const creators: Person[] = (mediaType === 'tv'
            ? details.created_by ?? []
            : (details.credits?.crew ?? []).filter((person: any) => person.job === 'Director')
        ).slice(0, 2)

        let season: HookFacts['season']
        if (mediaType === 'tv' && Number(details.number_of_seasons) > 0) {
            const number = Number(details.number_of_seasons)
            const last = (details.seasons ?? []).find((item: any) => item.season_number === number)
            season = {number, returning: number >= 2 && (Boolean(details.next_episode_to_air) || isRecent(last?.air_date, now))}
        }

        const franchise = String(details.belongs_to_collection?.name ?? '')
            .replace(/\s*[(\[]?\s*коллекция\s*[)\]]?\s*/iu, ' ').trim() || undefined

        const awards = await fromWikidata(details.external_ids?.wikidata_id).catch(error => {
            console.warn('[HOOK FACTS] Wikidata failed', error instanceof Error ? error.message : error)
            return []
        })

        return {
            cast: cast.map(person => person.name),
            creators: creators.map(person => person.name),
            ...(franchise ? {franchise} : {}),
            ...(season ? {season} : {}),
            awards
        }
    } catch (error) {
        console.warn('[HOOK FACTS] TMDB failed', error instanceof Error ? error.message : error)
        return undefined
    }
}

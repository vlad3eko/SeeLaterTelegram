/**
 * «🎂 Именинники дня» (/g → Актёры и режиссёры): самые известные актёры или режиссёры,
 * родившиеся сегодня. Только по нажатию «Искать» — один запрос к Wikidata, TMDB не нужен.
 *
 * Wikidata знает дату рождения (P569), ID в TMDB (P4985) и русское имя. Поиск по дню и месяцу
 * у Wikidata упирается в таймаут, поэтому даты перечисляются явно по годам (поиск по индексу).
 * Известность — число статей в Википедиях (sitelinks). Шум (ведущие, певцы, снявшиеся
 * эпизодически) отсекается порогом фильмов: в ролях (P161) не меньше 10, режиссёр (P57) — 4.
 * Индия и Россия исключены по гражданству — как фильмы этих стран в подборках.
 */

export type PersonRole = 'actor' | 'director'
export type PersonLife = 'alive' | 'dead'

export type BirthdayPerson = {
    /** ID человека в TMDB. */
    id: number
    name: string
    /** Год рождения и, у ушедших, год смерти. */
    born: number
    died?: number
    /** Портрет с Викисклада (P18 Wikidata), если есть. */
    image?: string
    /** file_id фото в Telegram (бот загружает портрет при поиске; без него — фото из TMDB). */
    photo?: string
}

const ENDPOINT = 'https://query.wikidata.org/sparql'
const FIRST_YEAR = 1880
const LIMIT = 10

/** Занятия Wikidata: актёр, киноактёр, телеактёр; кинорежиссёр. */
const OCCUPATIONS: Record<PersonRole, string[]> = {
    actor: ['wd:Q33999', 'wd:Q10800557', 'wd:Q10798782'],
    director: ['wd:Q2526255']
}
const MIN_FILMS: Record<PersonRole, number> = {actor: 10, director: 4}
/** Гражданство: Индия, Россия. */
const EXCLUDED_CITIZENSHIP = ['wd:Q668', 'wd:Q159']
/**
 * Не актёры по сути, хотя «снимались»: телеведущий, ведущий ток-шоу, журналист, бэнд-лидер
 * (живая проверка 19.11: Ларри Кинг и Томми Дорси — в фильмах в роли самих себя).
 */
const EXCLUDED_OCCUPATIONS = ['wd:Q947873', 'wd:Q3286043', 'wd:Q1930187', 'wd:Q806349']

/** Месяц и день по Москве: «11-19». */
export const monthDay = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Moscow', month: '2-digit', day: '2-digit'}).formatToParts(date)
    return `${parts.find(part => part.type === 'month')!.value}-${parts.find(part => part.type === 'day')!.value}`
}

/** Год по Москве. */
const moscowYear = (date = new Date()) =>
    Number(new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Moscow', year: 'numeric'}).format(date))

export const birthdayQuery = (role: PersonRole, life: PersonLife, day: string, lastYear: number) => {
    const dates: string[] = []
    for (let year = FIRST_YEAR; year <= lastYear; year++) dates.push(`"${year}-${day}T00:00:00Z"^^xsd:dateTime`)
    const filmProp = role === 'director' ? 'wdt:P57' : 'wdt:P161'
    return `SELECT ?tmdb ?ru ?en ?birth ?death ?links (COUNT(DISTINCT ?film) AS ?films) (SAMPLE(?image) AS ?img) WHERE {
  VALUES ?birth { ${dates.join(' ')} }
  ?p wdt:P569 ?birth; wdt:P4985 ?tmdb; wikibase:sitelinks ?links.
  FILTER(?links >= 15)
  FILTER EXISTS { VALUES ?occ { ${OCCUPATIONS[role].join(' ')} } ?p wdt:P106 ?occ }
  FILTER NOT EXISTS { VALUES ?country { ${EXCLUDED_CITIZENSHIP.join(' ')} } ?p wdt:P27 ?country }
  FILTER NOT EXISTS { VALUES ?other { ${EXCLUDED_OCCUPATIONS.join(' ')} } ?p wdt:P106 ?other }
  ${life === 'dead' ? 'OPTIONAL { ?p wdt:P570 ?death } FILTER(BOUND(?death))' : 'FILTER NOT EXISTS { ?p wdt:P570 [] }'}
  ?film ${filmProp} ?p; wdt:P31 wd:Q11424.
  OPTIONAL { ?p rdfs:label ?ru FILTER(LANG(?ru) = "ru") }
  OPTIONAL { ?p rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?p wdt:P18 ?image }
} GROUP BY ?tmdb ?ru ?en ?birth ?death ?links
HAVING(COUNT(DISTINCT ?film) >= ${MIN_FILMS[role]})
ORDER BY DESC(?links) LIMIT ${LIMIT * 3}`
}

type Binding = Record<string, {value: string} | undefined>

/** «Озолиня, Лилита Арвидовна» (так в Wikidata у части русских имён) → «Лилита Арвидовна Озолиня». */
export const displayName = (label: string) => {
    const match = /^([^,]+),\s*(.+)$/.exec(label.trim())
    return match ? `${match[2]} ${match[1]}` : label.trim()
}

/** Ответ Wikidata → до 10 человек (у одного человека бывает несколько ID TMDB или дат смерти — первый). */
export const parseBirthdays = (body: {results?: {bindings?: Binding[]}}, limit = LIMIT): BirthdayPerson[] => {
    const people: BirthdayPerson[] = []
    const seen = new Set<string>()
    for (const row of body.results?.bindings ?? []) {
        const id = Number(row.tmdb?.value)
        const label = row.ru?.value || row.en?.value
        const name = label ? displayName(label) : undefined
        const born = Number(row.birth?.value.slice(0, 4))
        if (!Number.isInteger(id) || id <= 0 || !name || !born) continue
        // Дубли: один человек под несколькими ID или одно имя у разных записей.
        if (seen.has(String(id)) || seen.has(name)) continue
        seen.add(String(id))
        seen.add(name)
        const died = row.death?.value ? Number(row.death.value.slice(0, 4)) : undefined
        // Special:FilePath отдаёт уменьшенную копию: Telegram скачивает её быстро.
        const image = row.img?.value ? `${row.img.value.replace(/^http:/, 'https:')}?width=640` : undefined
        people.push({id, name, born, ...(died ? {died} : {}), ...(image ? {image} : {})})
        if (people.length >= limit) break
    }
    return people
}

/** «64 года» / «1920–1991». */
export const lifeLabel = (person: BirthdayPerson, year = moscowYear()) => {
    if (person.died) return `${person.born}–${person.died}`
    const age = year - person.born
    const mod10 = age % 10, mod100 = age % 100
    const word = mod10 === 1 && mod100 !== 11 ? 'год' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'года' : 'лет'
    return `${age} ${word}`
}

// Повторное нажатие «Искать» в тот же день не идёт в Wikidata снова.
const cache = new Map<string, BirthdayPerson[]>()

export const findBirthdays = async (
    role: PersonRole,
    life: PersonLife,
    {date = new Date(), fetchImpl = fetch}: {date?: Date, fetchImpl?: typeof fetch} = {}
): Promise<BirthdayPerson[]> => {
    const day = monthDay(date)
    const key = `${moscowYear(date)}-${day}:${role}:${life}`
    const cached = cache.get(key)
    if (cached) return cached

    const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
            // Wikidata просит понятный User-Agent у автоматических клиентов.
            'User-Agent': 'collections-bot/1.0 (birthday list)',
            Accept: 'application/sparql-results+json',
            'content-type': 'application/x-www-form-urlencoded'
        },
        body: `query=${encodeURIComponent(birthdayQuery(role, life, day, moscowYear(date) - 10))}`,
        signal: AbortSignal.timeout(45_000)
    })
    if (!response.ok) throw new Error(`Wikidata ${response.status}`)
    const people = parseBirthdays(await response.json())
    // Прошлые дни не нужны: 4 варианта в день, чистим, чтобы память не росла.
    if (cache.size >= 32) cache.clear()
    cache.set(key, people)
    return people
}

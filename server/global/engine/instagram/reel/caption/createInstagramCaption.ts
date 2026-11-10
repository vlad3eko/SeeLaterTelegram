import { dataCollectionMediaCard } from "#server/global/engine/card/collectionCard/dataCollectionMediaCard";

type CreateInstagramCaptionParams = {
    media: any
    comment?: string
    overview?: string
    contentType?: string
    // Текущий момент. Нужен только для проверок, в проде не передаётся.
    now?: Date
}

const randomItem = <T>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)]

const MONTHS_GENITIVE = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
]

const MONTHS_PREPOSITIONAL = [
    'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
    'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'
]

export const formatHumanDate = (date?: string) => {
    if (!date) {
        return ''
    }
    const [year, month, day] = date.split('-').map(Number)
    if (!year || !month || !day) {
        return ''
    }
    return `${day} ${MONTHS_GENITIVE[month - 1]} ${year}`
}

// ---------------------------------------------------------------------------
// Даты
// ---------------------------------------------------------------------------

type CalendarDate = {
    year: number
    month: number
    day: number
    time: number
}

const DAY_MS = 24 * 60 * 60 * 1000

// Сколько дней после выхода событие ещё считается свежим новостным поводом.
const FRESH_DAYS = 45
// До какого срока про выход ещё говорим «в марте», а не «в 2024 году».
const RECENT_DAYS = 365
// Сезон, который всё ещё идёт по серии в неделю, считаем свежим дольше.
const AIRING_SEASON_FRESH_DAYS = 120
// Анонс сезона, до которого дальше, чем это число дней, не считаем новостью.
const UPCOMING_SEASON_MAX_DAYS = 180

const parseCalendarDate = (value: unknown): CalendarDate | undefined => {
    const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)

    if (!match) {
        return undefined
    }

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])

    if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
        return undefined
    }

    return {year, month, day, time: Date.UTC(year, month - 1, day)}
}

// «Сегодня» считаем по Москве: канал русскоязычный, а сервер может жить в UTC.
const getToday = (now: Date): CalendarDate => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(now)

    const pick = (type: string) =>
        Number(parts.find(part => part.type === type)?.value)

    const year = pick('year')
    const month = pick('month')
    const day = pick('day')

    return {year, month, day, time: Date.UTC(year, month - 1, day)}
}

// > 0: дата в прошлом, 0: сегодня, < 0: в будущем.
const daysSince = (date: CalendarDate, today: CalendarDate) =>
    Math.round((today.time - date.time) / DAY_MS)

const formatDayMonth = (date: CalendarDate, withYear: boolean) =>
    `${date.day} ${MONTHS_GENITIVE[date.month - 1]}${withYear ? ` ${date.year}` : ''}`

// «сегодня», «завтра» или «15 ноября»; для будущих дат из другого года добавляет год.
const describeUpcomingDate = (date: CalendarDate, today: CalendarDate) => {
    const left = -daysSince(date, today)

    if (left === 0) {
        return 'сегодня'
    }

    if (left === 1) {
        return 'завтра'
    }

    return formatDayMonth(date, date.year !== today.year)
}

type Age = 'today' | 'fresh' | 'recent' | 'older'

// Готовая вставка для фразы «вышел …»: «сегодня», «вчера», «8 ноября»,
// «в марте», «в 2024 году».
const describePast = (date: CalendarDate, today: CalendarDate): { age: Age, when: string, days: number } => {
    const days = daysSince(date, today)

    if (days <= 0) {
        return {age: 'today', when: 'сегодня', days}
    }

    if (days === 1) {
        return {age: 'fresh', when: 'вчера', days}
    }

    if (days <= FRESH_DAYS) {
        return {age: 'fresh', when: formatDayMonth(date, false), days}
    }

    if (days <= RECENT_DAYS) {
        const month = MONTHS_PREPOSITIONAL[date.month - 1]
        const year = date.year !== today.year ? ` ${date.year}` : ''

        return {age: 'recent', when: `в ${month}${year}`, days}
    }

    return {age: 'older', when: `в ${date.year} году`, days}
}

// ---------------------------------------------------------------------------
// Слова
// ---------------------------------------------------------------------------

const plural = (count: number, forms: [string, string, string]) => {
    const abs = Math.abs(count) % 100
    const last = abs % 10

    if (abs > 10 && abs < 20) {
        return forms[2]
    }

    if (last === 1) {
        return forms[0]
    }

    if (last >= 2 && last <= 4) {
        return forms[1]
    }

    return forms[2]
}

const SEASON_ORDINALS = [
    '', 'первый', 'второй', 'третий', 'четвёртый', 'пятый',
    'шестой', 'седьмой', 'восьмой', 'девятый', 'десятый'
]

const seasonOrdinal = (number: number) => SEASON_ORDINALS[number] || `${number}-й`

// Название ставим только в именительном падеже и рядом со словом «фильм» / «сериал»:
// склонять произвольные названия нельзя, а род глагола зависит от слова-типа.
const getTypeWords = (label: string) => {
    const noun = label.trim().toLowerCase()
    const neuter = noun === 'аниме'

    return {
        noun,
        Noun: noun.charAt(0).toUpperCase() + noun.slice(1),
        released: neuter ? 'вышло' : 'вышел',
        returned: neuter ? 'вернулось' : 'вернулся',
        started: neuter ? 'стартовало' : 'стартовал',
        newAdj: neuter ? 'новое' : 'новый'
    }
}

type TypeWords = ReturnType<typeof getTypeWords>

// Вложенные кавычки по правилам: снаружи «ёлочки», внутри „лапки“.
const quoteTitle = (title: string) =>
    `«${title.trim().replace(/«/g, '„').replace(/»/g, '“')}»`

const formatRuntime = (minutes: unknown) => {
    const total = Number(minutes)

    if (!Number.isFinite(total) || total <= 0) {
        return ''
    }

    const hours = Math.floor(total / 60)
    const rest = Math.round(total % 60)

    if (!hours) {
        return `${rest} мин`
    }

    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`
}

// ---------------------------------------------------------------------------
// Сюжет
// ---------------------------------------------------------------------------

const PLACEHOLDER_OVERVIEWS = ['описание отсутствует', 'описание сюжета отсутствует']

const OVERVIEW_LIMIT = 300

// Конец предложения, который на самом деле сокращение или инициал («Дж.», «т. е.»).
const ABBREVIATION_END = /(?:^|\s)(?:[А-ЯЁA-Z][а-яёa-z]?|т|тыс|млн|млрд|им|ул|г|гг|см|напр)\.$/u

const splitSentences = (text: string): string[] => {
    const parts = text.split(/(?<=[.!?…])\s+(?=[«"“(\p{Lu}\d])/u)
    const sentences: string[] = []

    for (const part of parts) {
        const previous = sentences[sentences.length - 1]

        if (previous && ABBREVIATION_END.test(previous)) {
            sentences[sentences.length - 1] = `${previous} ${part}`
        } else {
            sentences.push(part)
        }
    }

    return sentences
}

const cutAtClause = (text: string, limit: number) => {
    const head = text.slice(0, limit)
    const cuts = [head.lastIndexOf(', '), head.lastIndexOf(' — '), head.lastIndexOf(' – ')]
    const clauseEnd = Math.max(...cuts)
    const cut = clauseEnd > limit * 0.5 ? clauseEnd : head.lastIndexOf(' ')

    return `${head.slice(0, cut > 0 ? cut : limit).trim()}…`
}

// Описание из TMDB пишет энциклопедист и часто пересказывает полфильма.
// В подписи оставляем завязку: одно-два предложения, без развязки.
const shortenOverview = (text: string, limit = OVERVIEW_LIMIT) => {
    const clean = text.replace(/\s+/g, ' ').trim()

    if (!clean) {
        return ''
    }

    const sentences = splitSentences(clean)
    let result = sentences[0] ?? clean

    for (const next of sentences.slice(1)) {
        if (`${result} ${next}`.length > limit) {
            break
        }

        result = `${result} ${next}`
    }

    if (result.length > limit + 80) {
        result = cutAtClause(result, limit)
    }

    return /[.!?…»"]$/.test(result) ? result : `${result}.`
}

// ---------------------------------------------------------------------------
// Что произошло: анализ дат, сезонов и серий
// ---------------------------------------------------------------------------

type SeasonProgress = {
    airedEpisodes?: number
    totalEpisodes?: number
    nextDate?: CalendarDate
    isAiring: boolean
}

type Story =
    | {
    kind: 'upcoming'
    scope: 'title' | 'season'
    seasonNumber: number
    whenFuture: string
    daysLeft: number
}
    | {
    kind: 'released'
    scope: 'title' | 'season'
    seasonNumber: number
    age: Age
    when: string
    year: number
    progress: string
}
    | { kind: 'unknown' }

type SeasonRecord = {
    number: number
    date: CalendarDate
    episodeCount?: number
}

const getSeasons = (media: any): SeasonRecord[] => {
    const raw: any[] = Array.isArray(media.seasons) ? media.seasons : []
    const seasons: SeasonRecord[] = []

    for (const season of raw) {
        const number = Number(season?.season_number)
        const date = parseCalendarDate(season?.air_date)

        // Нулевой «сезон» в TMDB — спецвыпуски, они не считаются.
        if (number > 0 && date) {
            seasons.push({
                number,
                date,
                episodeCount: Number(season?.episode_count) || undefined
            })
        }
    }

    return seasons.sort((a, b) => a.number - b.number)
}

const getSeasonProgress = (
    media: any,
    season: SeasonRecord,
    today: CalendarDate
): SeasonProgress => {
    const last = media.last_episode_to_air
    const next = media.next_episode_to_air

    const lastInSeason = Number(last?.season_number) === season.number ? last : undefined
    const nextInSeason = Number(next?.season_number) === season.number ? next : undefined
    const nextDate = parseCalendarDate(nextInSeason?.air_date)

    let airedEpisodes: number | undefined

    if (lastInSeason) {
        airedEpisodes = Number(lastInSeason.episode_number) || undefined
    } else if (nextInSeason && Number(nextInSeason.episode_number) > 1) {
        airedEpisodes = Number(nextInSeason.episode_number) - 1
    }

    return {
        airedEpisodes,
        totalEpisodes: season.episodeCount,
        nextDate,
        isAiring: Boolean(nextDate && daysSince(nextDate, today) <= 0)
    }
}

// «Вышло 2 серии из 8, следующая — 15 ноября.» Пустая строка, если данных
// недостаточно или они выглядят устаревшими: лучше промолчать, чем соврать.
const describeProgress = (progress: SeasonProgress, today: CalendarDate) => {
    const {airedEpisodes, totalEpisodes, nextDate} = progress

    if (!airedEpisodes || !totalEpisodes || airedEpisodes > totalEpisodes) {
        return ''
    }

    if (progress.isAiring && airedEpisodes < totalEpisodes) {
        const verb = airedEpisodes % 10 === 1 && airedEpisodes % 100 !== 11
            ? `Вышла ${airedEpisodes} серия`
            : `Вышло ${airedEpisodes} ${plural(airedEpisodes, ['серия', 'серии', 'серий'])}`
        const next = nextDate
            ? `, следующая — ${describeUpcomingDate(nextDate, today)}`
            : ''

        return `${verb} из ${totalEpisodes}${next}.`
    }

    if (!progress.isAiring && airedEpisodes >= totalEpisodes) {
        return `Сезон вышел целиком — ${totalEpisodes} ${plural(totalEpisodes, ['серия', 'серии', 'серий'])}.`
    }

    return ''
}

const buildReleased = (
    scope: 'title' | 'season',
    seasonNumber: number,
    date: CalendarDate,
    today: CalendarDate,
    progress: string,
    forceFresh = false
): Story => {
    const past = describePast(date, today)

    return {
        kind: 'released',
        scope,
        seasonNumber,
        age: forceFresh && past.age !== 'today' ? 'fresh' : past.age,
        when: past.when,
        year: date.year,
        progress
    }
}

const buildUpcoming = (
    scope: 'title' | 'season',
    seasonNumber: number,
    date: CalendarDate,
    today: CalendarDate
): Story => ({
    kind: 'upcoming',
    scope,
    seasonNumber,
    whenFuture: describeUpcomingDate(date, today),
    daysLeft: -daysSince(date, today)
})

const buildStory = (media: any, isTv: boolean, today: CalendarDate): Story => {
    if (!isTv) {
        const release = parseCalendarDate(media.release_date)

        if (!release) {
            return {kind: 'unknown'}
        }

        return daysSince(release, today) < 0
            ? buildUpcoming('title', 1, release, today)
            : buildReleased('title', 1, release, today, '')
    }

    const firstAir = parseCalendarDate(media.first_air_date)
    const seasons = getSeasons(media)
    const aired = seasons.filter(season => daysSince(season.date, today) >= 0)
    const latest = aired[aired.length - 1]
    const upcomingSeason = seasons.find(season => daysSince(season.date, today) < 0)

    // 1. Сериал ещё не стартовал.
    if (firstAir && daysSince(firstAir, today) < 0) {
        return buildUpcoming('title', 1, firstAir, today)
    }

    // 2. Недавно вышел новый сезон (не первый).
    if (latest && latest.number >= 2) {
        const progress = getSeasonProgress(media, latest, today)
        const past = describePast(latest.date, today)
        const isFresh =
            past.age === 'today' ||
            past.age === 'fresh' ||
            (progress.isAiring && past.days <= AIRING_SEASON_FRESH_DAYS)

        if (isFresh || past.age === 'recent') {
            return buildReleased(
                'season',
                latest.number,
                latest.date,
                today,
                isFresh ? describeProgress(progress, today) : '',
                isFresh
            )
        }
    }

    // 3. Новый сезон анонсирован.
    if (upcomingSeason && upcomingSeason.number >= 2) {
        const left = -daysSince(upcomingSeason.date, today)

        if (left <= UPCOMING_SEASON_MAX_DAYS) {
            return buildUpcoming('season', upcomingSeason.number, upcomingSeason.date, today)
        }
    }

    // 4. Разговор о сериале целиком.
    const premiere = seasons.find(season => season.number === 1)
    const premiereDate = firstAir ?? premiere?.date

    if (!premiereDate) {
        return {kind: 'unknown'}
    }

    const progress = premiere && daysSince(premiere.date, today) <= AIRING_SEASON_FRESH_DAYS
        ? describeProgress(getSeasonProgress(media, premiere, today), today)
        : ''

    return buildReleased('title', 1, premiereDate, today, progress)
}

// ---------------------------------------------------------------------------
// Фразы
// ---------------------------------------------------------------------------

const buildIntroVariants = (
    story: Story,
    words: TypeWords,
    quotedTitle: string,
    isTv: boolean
): string[] => {
    const {noun, Noun, released, returned, started} = words
    const T = quotedTitle

    if (story.kind === 'unknown') {
        return [
            `В список на просмотр: ${noun} ${T}.`,
            `${Noun} ${T}.`
        ]
    }

    if (story.kind === 'upcoming') {
        const {whenFuture, daysLeft} = story
        const S = seasonOrdinal(story.seasonNumber)

        if (story.scope === 'season') {
            return [
                `${T}: ${S} сезон выйдет ${whenFuture}.`,
                `${Noun} ${T} вернётся — ${S} сезон выйдет ${whenFuture}.`,
                `${T}: ${S} сезон — ${whenFuture}.`
            ]
        }

        const verb = isTv ? 'стартует' : 'выйдет'

        return [
            `${Noun} ${T} ${verb} ${whenFuture}.`,
            `Запоминаем дату: ${noun} ${T} ${verb} ${whenFuture}.`,
            `${Noun} ${T}: премьера — ${whenFuture}.`,
            daysLeft <= 7
                ? `Совсем скоро: ${noun} ${T} ${verb} ${whenFuture}.`
                : `Ждёте ${noun} ${T}? Премьера — ${whenFuture}.`
        ]
    }

    const {when, year, age} = story

    if (story.scope === 'season') {
        const S = seasonOrdinal(story.seasonNumber)

        if (age === 'today' || age === 'fresh') {
            return [
                `${Noun} ${T} ${returned}: ${S} сезон вышел ${when}.`,
                `${T}: ${S} сезон стартовал ${when}.`,
                `Вышел ${S} сезон — ${noun} ${T} продолжается.`
            ]
        }

        return [
            `${Noun} ${T}: ${S} сезон вышел ${when}.`,
            `${Noun} ${T} продолжается — ${S} сезон вышел ${when}.`
        ]
    }

    const go = isTv ? started : released

    switch (age) {
        case 'today':
            return [
                `${Noun} ${T} ${go} сегодня.`,
                `Сегодня ${go} ${noun} ${T}.`,
                isTv ? `${Noun} ${T}: премьера — сегодня.` : `Сегодня премьера: ${noun} ${T}.`
            ]
        case 'fresh':
            return [
                `${Noun} ${T} ${go} ${when}.`,
                `${Noun} ${T}: премьера состоялась ${when}.`,
                `Свежая премьера: ${noun} ${T} — ${when}.`
            ]
        case 'recent':
            return [
                `${Noun} ${T} ${released} ${when}.`,
                `${Noun} ${T}: премьера состоялась ${when}.`,
                `${Noun} ${T} — премьера была ${when}.`
            ]
        default:
            return [
                `${Noun} ${T}, ${year} год.`,
                `${Noun} ${year} года — ${T}.`,
                `Напоминаем про ${noun} ${T} (${year}).`,
                `Если пропустили ${noun} ${T} (${year}) — вот о чём речь.`
            ]
    }
}

const pickEmoji = (story: Story, isTv: boolean) => {
    if (story.kind === 'upcoming') {
        return randomItem(['👀', '📅'])
    }

    if (story.kind === 'released' && (story.age === 'today' || story.age === 'fresh')) {
        return randomItem(isTv ? ['🔥', '📺', '🍿'] : ['🔥', '🎬', '🍿'])
    }

    return randomItem(isTv ? ['📺', '🍿'] : ['🎬', '🍿'])
}

// Вопросы без местоимений («его», «неё»): род зависит от типа, а «уже» стоит
// только там, где с выхода действительно прошло время.
const buildEndingVariants = (story: Story): string[] => {
    if (story.kind === 'upcoming') {
        return ['Ждёте?', 'Будете смотреть?', 'Добавляем в список?']
    }

    if (story.kind === 'unknown') {
        return ['Будете смотреть?', 'Смотрели?']
    }

    if (story.scope === 'season') {
        return story.age === 'recent'
            ? ['Успели посмотреть?', 'Смотрели прошлый сезон?']
            : ['Смотрели прошлый сезон?', 'Будете смотреть?', 'Кто уже смотрит?']
    }

    switch (story.age) {
        case 'today':
            return ['Будете смотреть?', 'Ждали?', 'Кто пойдёт смотреть?']
        case 'fresh':
            return ['Будете смотреть?', 'Кто уже успел посмотреть?', 'Кто уже смотрит?']
        case 'recent':
            return ['Успели посмотреть?', 'Кто уже смотрел?', 'Смотрели или ещё в планах?']
        default:
            return ['Смотрели?', 'Кто смотрел? Как вам?', 'Пересмотрели бы?']
    }
}

// ---------------------------------------------------------------------------
// Подпись целиком
// ---------------------------------------------------------------------------

export const createInstagramCaption = ({
                                           media,
                                           comment,
                                           overview,
                                           contentType,
                                           now
                                       }: CreateInstagramCaptionParams) => {
    const source = media ?? {}
    const dataCollection = dataCollectionMediaCard({
        media: source,
        contentType: contentType || source.media_type || 'movie',
        addComment: comment,
        addOverview: overview
    })

    const today = getToday(now ?? new Date())
    const isTv = Boolean(
        source.first_air_date ||
        Array.isArray(source.seasons) ||
        contentType === 'series' ||
        contentType === 'cartoonSeries'
    ) && !source.release_date

    const typeLabel = /[а-яё]/i.test(dataCollection.mediaType)
        ? dataCollection.mediaType
        : (isTv ? 'сериал' : 'фильм')

    const words = getTypeWords(typeLabel)
    const quotedTitle = quoteTitle(dataCollection.title)
    const story = buildStory(source, isTv, today)

    const intro = randomItem(buildIntroVariants(story, words, quotedTitle, isTv)) ?? ''
    const progress = story.kind === 'released' ? story.progress : ''
    const introParagraph = [`${pickEmoji(story, isTv) ?? ''} ${intro}`.trim(), progress]
        .filter(Boolean)
        .join(' ')

    const editorComment = dataCollection.data.addComment?.trim()
    const tagline = String(source.tagline ?? '').trim()

    // Завязка: текст, который вписал редактор, не трогаем; описание из TMDB сокращаем.
    const editorOverview = overview?.trim()
    const tmdbOverview = String(source.overview ?? '').trim()
    const isPlaceholder = (text: string) =>
        PLACEHOLDER_OVERVIEWS.includes(text.toLowerCase().replace(/\.$/, ''))

    let synopsis = ''

    if (editorOverview && !isPlaceholder(editorOverview)) {
        synopsis = editorOverview
    } else if (tmdbOverview && !isPlaceholder(tmdbOverview)) {
        synopsis = shortenOverview(tmdbOverview)
    } else if (tagline) {
        synopsis = tagline
    }

    const actorNames = Array.isArray(source.credits)
        ? source.credits
            .filter((person: any) =>
                person?.name &&
                person?.character &&
                person?.known_for_department === 'Acting'
            )
            .sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999))
            .slice(0, 4)
            .map((actor: any) => actor.name)
            .join(', ')
        : ''

    const cast = actorNames
        ? randomItem([`В ролях: ${actorNames}.`, `Играют: ${actorNames}.`])
        : ''

    const details: string[] = []
    const genres = dataCollection.genres

    if (genres && genres !== 'нет жанров') {
        details.push(`Жанр — ${genres.toLowerCase()}`)
    }

    if (isTv) {
        const seasonsCount = Number(source.number_of_seasons)
        const episodesCount = Number(source.number_of_episodes)

        if (seasonsCount > 0 && episodesCount > 0) {
            details.push(`Сезонов — ${seasonsCount}, серий — ${episodesCount}`)
        }
    } else {
        const runtime = formatRuntime(source.runtime)

        if (runtime) {
            details.push(`Продолжительность — ${runtime}`)
        }
    }

    const ending = randomItem(buildEndingVariants(story))

    return [
        introParagraph,
        editorComment,
        synopsis,
        cast,
        details.join('\n'),
        ending
    ].filter(Boolean).join('\n\n')
}

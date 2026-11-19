/**
 * Полки подборок /g: что смотрим. У TMDB только два типа (movie и tv), поэтому мультфильмы, аниме и
 * дунхуа — это те же фильмы и сериалы, различённые жанром «Анимация» (16) и происхождением.
 *
 * Классификатор происхождения анимации один на весь проект: им пользуются и подборки, и
 * normalizeTmdbMedia (тип контента в карточках). Решение владельца 19.11: аниме — японская
 * анимация, дунхуа (материковый Китай) — отдельная полка, остальное, включая совместное и
 * неопределённое, — мультфильмы и мультсериалы.
 */

export type MediaType = 'movie' | 'tv'

export type ShelfKey =
    | 'movie' | 'series'
    | 'animated_movie' | 'animated_series'
    | 'anime_movie' | 'anime_series'
    | 'donghua_movie' | 'donghua_series'

export type AnimationOrigin =
    | 'japan' | 'mainland_china' | 'taiwan' | 'hong_kong' | 'south_korea'
    | 'other' | 'mixed' | 'unknown'

export const ANIMATION_GENRE = 16

/** Тип контента в базе и карточках (значения ContentType; у дунхуа своего нет — мультфильм/мультсериал). */
export type ShelfContentType = 'movie' | 'series' | 'cartoon' | 'cartoonSeries' | 'anime'

export type Shelf = {
    key: ShelfKey
    mediaType: MediaType
    label: string
    animation: boolean
    /** Происхождение, которое пускается на полку (только у анимации). */
    origins?: AnimationOrigin[]
    /** Discover: страна происхождения, если TMDB умеет сузить выборку сам. */
    originCountry?: string
    contentType: ShelfContentType
    /** «Известный» тайтл — от стольких голосов (у мультсериалов и аниме голосов меньше). */
    knownVotes: number
}

const OTHER_ORIGINS: AnimationOrigin[] = ['taiwan', 'hong_kong', 'south_korea', 'other', 'mixed', 'unknown']

export const SHELVES: Record<ShelfKey, Shelf> = {
    movie: {key: 'movie', mediaType: 'movie', label: 'Фильмы', animation: false, contentType: 'movie', knownVotes: 300},
    series: {key: 'series', mediaType: 'tv', label: 'Сериалы', animation: false, contentType: 'series', knownVotes: 100},
    animated_movie: {key: 'animated_movie', mediaType: 'movie', label: 'Мультфильмы', animation: true, origins: OTHER_ORIGINS, contentType: 'cartoon', knownVotes: 150},
    animated_series: {key: 'animated_series', mediaType: 'tv', label: 'Мультсериалы', animation: true, origins: OTHER_ORIGINS, contentType: 'cartoonSeries', knownVotes: 50},
    anime_movie: {key: 'anime_movie', mediaType: 'movie', label: 'Аниме-фильмы', animation: true, origins: ['japan'], originCountry: 'JP', contentType: 'anime', knownVotes: 100},
    anime_series: {key: 'anime_series', mediaType: 'tv', label: 'Аниме-сериалы', animation: true, origins: ['japan'], originCountry: 'JP', contentType: 'anime', knownVotes: 50},
    donghua_movie: {key: 'donghua_movie', mediaType: 'movie', label: 'Дунхуа-фильмы', animation: true, origins: ['mainland_china'], originCountry: 'CN', contentType: 'cartoon', knownVotes: 30},
    donghua_series: {key: 'donghua_series', mediaType: 'tv', label: 'Дунхуа-сериалы', animation: true, origins: ['mainland_china'], originCountry: 'CN', contentType: 'cartoonSeries', knownVotes: 20}
}

export const shelfByKey = (key: string | undefined): Shelf | undefined =>
    key && key in SHELVES ? SHELVES[key as ShelfKey] : undefined

/**
 * Ручные исключения классификатора: совместные производства и спорные случаи
 * («media_type:id» → происхождение). Дополняется по аудиту.
 */
export const ORIGIN_OVERRIDES: Record<string, AnimationOrigin> = {}

type Raw = Record<string, any>

/** Страны производства тайтла: у сериалов origin_country, у фильмов — production_countries / origin_country. */
const countriesOf = (item: Raw): string[] => {
    const list: string[] = [
        ...(item.origin_country ?? []),
        ...((item.production_countries ?? []) as Raw[]).map(country => country.iso_3166_1)
    ].filter((code): code is string => typeof code === 'string' && code.length === 2)
    return [...new Set(list.map(code => code.toUpperCase()))]
}

const COUNTRY_ORIGIN: Record<string, AnimationOrigin> = {
    JP: 'japan', CN: 'mainland_china', TW: 'taiwan', HK: 'hong_kong', KR: 'south_korea'
}

const LANGUAGE_ORIGIN: Record<string, AnimationOrigin> = {
    ja: 'japan', zh: 'mainland_china', cn: 'mainland_china', ko: 'south_korea'
}

/**
 * Происхождение анимации по сигналам TMDB. Порядок силы: ручное исключение → страна
 * производства → язык оригинала. Несколько «своих» стран (JP + CN) — mixed: ведущего
 * производителя по TMDB не определить. Китайский язык без страны — материковый Китай,
 * но с TW/HK в странах — Тайвань/Гонконг.
 */
export const classifyOrigin = (item: Raw, mediaType?: MediaType): AnimationOrigin => {
    const override = mediaType ? ORIGIN_OVERRIDES[`${mediaType}:${item.id}`] : undefined
    if (override) return override

    const countries = countriesOf(item)
    const language = String(item.original_language ?? '').toLowerCase()
    const known = [...new Set(countries.map(code => COUNTRY_ORIGIN[code]).filter((origin): origin is AnimationOrigin => Boolean(origin)))]

    if (known.length > 1) {
        // Язык выбирает между «своими» странами (японская студия с китайским подрядчиком).
        const byLanguage = LANGUAGE_ORIGIN[language]
        if (byLanguage && known.includes(byLanguage) && countries.length <= 2) return byLanguage
        return 'mixed'
    }
    if (known.length === 1) {
        const origin = known[0]!
        // Страна «своя», но фильм совместный с западной студией и не на её языке — смешанное.
        const languageOrigin = LANGUAGE_ORIGIN[language]
        if (countries.length > 1 && languageOrigin !== origin && origin !== 'south_korea') return 'mixed'
        return origin
    }
    if (countries.length) return 'other'
    return LANGUAGE_ORIGIN[language] ?? (language ? 'other' : 'unknown')
}

export const isAnimation = (item: Raw): boolean =>
    ((item.genre_ids ?? []) as number[]).map(Number).includes(ANIMATION_GENRE) ||
    ((item.genres ?? []) as Raw[]).some(genre => Number(genre.id) === ANIMATION_GENRE)

/** Полка тайтла (null — тайтл никуда не относится, например тип неизвестен). */
export const shelfOf = (item: Raw, mediaType: MediaType): ShelfKey => {
    if (!isAnimation(item)) return mediaType === 'movie' ? 'movie' : 'series'
    const origin = classifyOrigin(item, mediaType)
    if (origin === 'japan') return mediaType === 'movie' ? 'anime_movie' : 'anime_series'
    if (origin === 'mainland_china') return mediaType === 'movie' ? 'donghua_movie' : 'donghua_series'
    return mediaType === 'movie' ? 'animated_movie' : 'animated_series'
}

/** Подходит ли тайтл полке. */
export const fitsShelf = (item: Raw, shelf: Shelf): boolean => shelfOf(item, shelf.mediaType) === shelf.key

/**
 * Жанры, которые полка не пускает: у живого кино — анимация (свои полки), ТВ-фильмы, новости,
 * реалити, ток-шоу; у анимации — то же без самой анимации.
 */
export const shelfExcludedGenres = (shelf: Shelf): number[] => {
    const base = shelf.mediaType === 'movie' ? [10770] : [10763, 10764, 10767]
    return shelf.animation ? base : [ANIMATION_GENRE, ...base]
}

/** Параметры discover, которые сужают выборку под полку (точная проверка — fitsShelf). */
export const shelfQuery = (shelf: Shelf): Record<string, string> => ({
    without_genres: shelfExcludedGenres(shelf).join(','),
    ...(shelf.animation ? {with_genres: String(ANIMATION_GENRE)} : {}),
    ...(shelf.originCountry ? {with_origin_country: shelf.originCountry} : {})
})

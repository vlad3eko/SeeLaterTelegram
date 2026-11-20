import {normalizeTmdbMedia} from '~/utils/media/normalizeTmdbMedia'
import {findUnsuitableMediaReason} from '#server/global/engine/youtube/config'

/**
 * Фильм или сериал TMDB по названию ролика вида
 *   «Девять жизней кота Нерона — Русский трейлер (Дубляж, 4K, 2027)»
 *   «Мстители 5: Доктор Дум — «Замок Доктора Дума» (Субтитры, 4K, 2026)».
 * Название — всё до первого тире, год — последнее четырёхзначное число в скобках.
 */

export type ParsedTrailerTitle = {
    name: string
    year?: number
    /** Трейлер нового сезона сериала: годом не проверяется (год TMDB — год первого сезона). */
    isSeason?: boolean
}

/** Слова трейлера в названии (англ. каналы студий): «Official Final Trailer 2», «Teaser Trailer», «[HD]». */
const TRAILER_WORDS =
    /\b(?:official\s+)?(?:final\s+|new\s+|main\s+|first\s+|teaser\s+)?(?:trailer|teaser)(?:\s*#?\s*\d+)?\b|\[?\b(?:hd|4k|uhd)\b\]?/gi

/** «ПРИЗРАЧНЫЙ СОЛДАТ Русский трейлер (4K Дубляж, 2026)» (FRESH Trailers): название без тире. */
const RU_TRAILER_WORDS = /\s+(?:финальный\s+|официальный\s+|новый\s+)?(?:русский\s+)?(?:трейлер|тизер)(?=[\s(#,.]|$)/iu

export const parseTrailerTitle = (title: string): ParsedTrailerTitle | null => {
    // Название — первая часть до « — », « - » или « | » (русские и английские каналы):
    //   «Бункер — Русский трейлер (Дубляж, 4К, 2027)», «Dune: Part Three | Final Trailer»,
    //   «Killing Castro (2026) Teaser Trailer - Diego Boneta …», «Wednesday: Season 2 | Official Teaser»,
    //   или до «Русский трейлер», если тире нет.
    const firstPart = (title.split(/\s+[—–-]\s+|\s*\|\s*/)[0] ?? '').split(RU_TRAILER_WORDS)[0] ?? ''
    const rest = title.slice(firstPart.length)
    // «Wednesday: Season 2 | …», «Bad Monkey — Season 2 Official Trailer», «Неуязвимый (5 сезон) — …»,
    // «Задача трёх тел: 2 сезон | …»: сезон в любой части.
    const isSeason = /\bseason\s+\d+/i.test(title) || /\d+\s*сезон/iu.test(title)

    const yearInName = firstPart.match(/\((19\d{2}|20\d{2})\)/)?.[1]
    const name = firstPart
        .replace(/\((?:19|20)\d{2}\)/g, ' ')
        .replace(TRAILER_WORDS, ' ')
        // Сезон сериала: в TMDB это один сериал («Wednesday: Season 2» → «Wednesday»).
        .replace(/[:\s]+season\s+\d+\b.*$/i, '')
        .replace(/[:\s]*\(?\s*\d+\s*сезон\s*\)?.*$/iu, '')
        .replace(/^(?:marvel\s+studios[’']?|disney[’']?s|pixar[’']?s)\s+/i, '')
        .replace(/[\s:,–—-]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    if (!name) return null

    // Год: в скобках («(Дубляж, 2027)», «Killing Castro (2026)»), иначе в хвосте после названия
    // («… | In Theaters March 5, 2026»). Число в самом названии («Blade Runner 2099») — не год.
    const brackets = [...title.matchAll(/\(([^()]*)\)/g)].map(match => match[1]!).join(' ')
    const fromBrackets = [...brackets.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(match => Number(match[1]))
    const fromRest = [...rest.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(match => Number(match[1]))
    const year = fromBrackets.at(-1) ?? (yearInName ? Number(yearInName) : fromRest.at(-1))

    return {name, ...(year ? {year} : {}), ...(isSeason ? {isSeason} : {})}
}

export const normalize = (value: string | undefined) =>
    String(value ?? '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/&/g, ' and ')
        .replace(/[«»"'“”„:;,.!?()[\]–—-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

/** Название без номера части: «Ледниковый период 6: Точка кипения» → как в TMDB, без «6». */
const withoutPartNumber = (value: string | undefined) =>
    normalize(value).replace(/(^|\s)\d{1,2}(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Совпадает ли название из ролика с тайтлом TMDB (русское или оригинальное название): 'exact',
 * 'part' — совпало без номера части (каналы пишут «… 6:», в TMDB его нет; только для новинок
 * текущего года и позже, иначе «Пчеловод 2» нашёл бы первого «Пчеловода»), или undefined.
 */
export const titleMatch = (name: string, item: Record<string, any>): 'exact' | 'part' | undefined => {
    const titles = [item.title, item.name, item.original_title, item.original_name]
    const wanted = normalize(name)
    if (titles.some(value => normalize(value) === wanted)) return 'exact'
    const loose = withoutPartNumber(name)
    if (loose === wanted || !loose) return undefined
    return (yearOf(item) ?? 0) >= new Date().getFullYear() && titles.some(value => withoutPartNumber(value) === loose)
        ? 'part'
        : undefined
}

export const yearOf = (item: Record<string, any>) => {
    const date = String(item.release_date || item.first_air_date || '')
    const year = Number(date.slice(0, 4))
    return Number.isFinite(year) && year > 0 ? year : undefined
}

export type MatchedMedia = {
    mediaId: number
    mediaType: 'movie' | 'tv'
    contentType: string
    /** Полный объект TMDB (как у /api/bot/getMediaBot), для карточки и подписи. */
    media: Record<string, any>
    tmdbTitle: string
    /** Из того же запроса, что и media, но не часть карточки. */
    extras: {
        cast: Array<{name?: string, popularity?: number}>
        director?: string
        englishOverview?: string
    }
}

const tmdbFetch = async (pathAndQuery: string) => {
    const apiKey = process.env.TMDB_API_KEY?.trim()
    if (!apiKey) throw new Error('[YOUTUBE MATCH] TMDB_API_KEY is missing')

    const response = await fetch(`https://api.themoviedb.org/3/${pathAndQuery}`, {
        headers: {accept: 'application/json', Authorization: `Bearer ${apiKey}`},
        signal: AbortSignal.timeout(20_000)
    })
    if (!response.ok) throw new Error(`[YOUTUBE MATCH] TMDB HTTP ${response.status}`)
    return await response.json() as Record<string, any>
}

/**
 * Лучшее совпадение или null. Принимается только совпадение названия (русского или
 * оригинального, см. titleMatch); при нескольких — точное, затем то, у которого год ближе к году
 * из ролика, затем популярнее.
 * Без точного названия ничего не публикуется: лучше пропустить ролик, чем выложить чужой фильм.
 */
export const matchTmdbMedia = async (parsed: ParsedTrailerTitle): Promise<MatchedMedia | null> => {
    const params = new URLSearchParams({query: parsed.name, language: 'ru-RU', include_adult: 'false', page: '1'})
    const search = await tmdbFetch(`search/multi?${params}`)
    const candidates = (search.results ?? [])
        .filter((item: Record<string, any>) => parsed.isSeason
            ? item.media_type === 'tv'
            : item.media_type === 'movie' || item.media_type === 'tv')
        .map((item: Record<string, any>) => {
            const year = yearOf(item)
            const distance = parsed.isSeason
                ? 0
                : parsed.year && year ? Math.abs(parsed.year - year) : parsed.year ? 50 : 0
            return {item, distance, match: titleMatch(parsed.name, item)}
        })
        .filter(({match}: {match?: string}) => match)
        // Год из ролика, если он есть, должен быть близок: трейлер выходит до премьеры или в её год.
        .filter(({distance}: {distance: number}) => distance <= 2)
        // Года в ролике нет («The Riot | Official Trailer | Netflix»): трейлеры выходят к новинкам,
        // поэтому старый однофамилец (фильм 2014 года) не подходит. Сезоны сериалов — исключение.
        .filter(({item}: {item: Record<string, any>}) => {
            if (parsed.year || parsed.isSeason) return true
            const year = yearOf(item)
            return !year || year >= new Date().getFullYear() - 1
        })
        // Точное название важнее совпадения без номера части.
        .sort((a: any, b: any) => (a.match === 'exact' ? 0 : 1) - (b.match === 'exact' ? 0 : 1) ||
            a.distance - b.distance || (b.item.popularity ?? 0) - (a.item.popularity ?? 0))

    const best = candidates[0]?.item
    if (!best) return null

    const mediaType = best.media_type as 'movie' | 'tv'
    return withCard({
        mediaId: Number(best.id),
        mediaType,
        contentType: normalizeTmdbMedia(best).content_type,
        tmdbTitle: String(best.title || best.name || parsed.name)
    })
}

/**
 * Карточка ru-RU одним запросом вместе с тем, что нужно очереди: актёры (порог известности
 * WELL_KNOWN, режиссёр для Gemini) и английское описание (перевод, если русского нет). Они
 * отделяются от карточки: в сессию Reel она идёт без них.
 */
const withCard = async (base: Omit<MatchedMedia, 'media' | 'extras'>): Promise<MatchedMedia> => {
    const {credits, translations, ...media} = await tmdbFetch(`${base.mediaType}/${base.mediaId}?language=ru-RU&append_to_response=credits,translations`)
    const english = (translations?.translations ?? [])
        .find((item: {iso_639_1?: string, iso_3166_1?: string}) => item.iso_639_1 === 'en' && item.iso_3166_1 === 'US') ??
        (translations?.translations ?? []).find((item: {iso_639_1?: string}) => item.iso_639_1 === 'en')
    return {
        ...base,
        media,
        extras: {
            cast: credits?.cast ?? [],
            director: (credits?.crew ?? []).find((person: {job?: string}) => person.job === 'Director')?.name ?? media.created_by?.[0]?.name,
            englishOverview: String(english?.data?.overview ?? '').trim() || undefined
        }
    }
}

/**
 * Тайтл TMDB, годный для публикации, или причина пропуска. Сбой TMDB — исключение (временный).
 * Очередь проверяет ролик при постановке, чтобы в ней не стояли ток-шоу, реалити и документалки,
 * и ещё раз перед публикацией (известный тайтл — одним запросом, `known`).
 */
export const resolveTrailerMedia = async (
    title: string,
    known?: Omit<MatchedMedia, 'media' | 'extras'>
): Promise<{matched: MatchedMedia, reason?: undefined} | {reason: string}> => {
    let matched: MatchedMedia | null
    if (known) {
        matched = await withCard(known)
    } else {
        const parsed = parseTrailerTitle(title)
        if (!parsed) return {reason: 'не удалось выделить название фильма'}
        matched = await matchTmdbMedia(parsed)
        if (!matched) return {reason: `в TMDB нет точного совпадения для «${parsed.name}»${parsed.year ? ` (${parsed.year})` : ''}`}
    }
    const unsuitable = findUnsuitableMediaReason(matched.media, matched.extras.cast)
    return unsuitable ? {reason: `«${matched.tmdbTitle}»: ${unsuitable}`} : {matched}
}

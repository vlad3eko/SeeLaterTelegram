import {hasRussianTitle} from '#server/global/engine/collections/buildCollection'
import {weightedRating} from '#server/global/engine/collections/bundleRules'
import {isExcludedOrigin} from '#server/global/engine/collections/catalog'
import {tmdbGet} from '#server/global/engine/collections/tmdb'
import {findTrailers, type Trailer} from '#server/global/engine/collections/trailers'
import type {PersonRole} from '#server/global/engine/collections/people/birthdays'

/**
 * Лучшие фильмы человека — основа поста «день рождения: 10 лучших фильмов».
 * Один запрос TMDB (person/{id}/movie_credits, кеш 30 минут) + проверка трейлеров, как в подборках.
 *
 * Актёр — только главные роли (первые MAIN_ROLES в титрах), без озвучки, камео и «самого себя»;
 * режиссёр — фильмы, которые он снял. Без документалок, концертов и роликов; русское название,
 * без российского и индийского кино. Порядок — байесовский рейтинг (мало голосов — ближе к средней).
 */

type Raw = Record<string, any>

export type PersonFilm = {id: number, title: string, original_title?: string, year?: number, score: number}
export type PersonTopItem = PersonFilm & {trailer: Trailer}

/** Главные роли: первые 4 в титрах. */
export const MAIN_ROLES = 4
const MIN_VOTES = 100
/** Порог байесовского рейтинга: оценка фильма с меньшим числом голосов тянется к средней. */
const PRIOR_VOTES = 1000
const PRIOR_MEAN = 6.5
const DOCUMENTARY = 99
const ANIMATION = 16
const NOT_A_ROLE = /(^|\W)(сам|сама|самого себя|саму себя|камео|himself|herself|themselves|self|cameo|uncredited|voice|голос)(\W|$)/i

/** Фильмы из movie_credits, подходящие под роль, — от лучшего к худшему. */
export const personFilms = (credits: {cast?: Raw[], crew?: Raw[]}, role: PersonRole): PersonFilm[] => {
    const entries = role === 'director'
        ? (credits.crew ?? []).filter(item => item.job === 'Director')
        : (credits.cast ?? []).filter(item =>
            Number(item.order ?? 99) < MAIN_ROLES &&
            !NOT_A_ROLE.test(String(item.character ?? '')) &&
            !(item.genre_ids ?? []).includes(ANIMATION))

    const seen = new Set<number>()
    const films = entries.filter(item => {
        const id = Number(item.id)
        if (seen.has(id)) return false
        seen.add(id)
        return !item.adult && !item.video &&
            !(item.genre_ids ?? []).includes(DOCUMENTARY) &&
            (Number(item.vote_count) || 0) >= MIN_VOTES &&
            hasRussianTitle(String(item.title ?? '')) &&
            !isExcludedOrigin(item) &&
            // Ещё не вышедшие — не в «лучшие».
            Boolean(item.release_date) && String(item.release_date) <= new Date().toISOString().slice(0, 10)
    })

    // Средняя — общая для кино, а не по фильмам человека: у звезды она высокая и тянет вверх малоизвестное.
    const mean = PRIOR_MEAN
    return films
        .map(item => {
            const date = String(item.release_date ?? '')
            return {
                id: Number(item.id),
                title: String(item.title),
                // Оригинальное название — для поиска кадров с актёром.
                ...(item.original_title ? {original_title: String(item.original_title)} : {}),
                ...(date ? {year: Number(date.slice(0, 4))} : {}),
                score: weightedRating(Number(item.vote_average) || 0, Number(item.vote_count) || 0, PRIOR_VOTES, mean)
            }
        })
        .sort((a, b) => b.score - a.score)
}

/** Топ человека с трейлерами: items — первые size с трейлером, rest — на «Ещё вариант». */
export const buildPersonTop = async (
    personId: number,
    role: PersonRole,
    {size = 10}: {size?: number} = {}
): Promise<{items: PersonTopItem[], rest: Array<{id: number, score: number}>}> => {
    const credits = await tmdbGet<{cast?: Raw[], crew?: Raw[]}>(`person/${personId}/movie_credits?language=ru-RU`)
    const films = personFilms(credits, role)

    const items: PersonTopItem[] = []
    let cursor = 0
    while (items.length < size && cursor < films.length) {
        const batch = films.slice(cursor, cursor + 6)
        const trailers = await findTrailers('movie', batch.map(film => film.id))
        for (const film of batch) {
            if (items.length >= size) break
            cursor++
            const trailer = trailers.get(film.id)
            if (trailer) items.push({...film, trailer})
        }
    }
    const used = new Set(items.map(item => item.id))
    const rest = films.slice(cursor).filter(film => !used.has(film.id)).map(film => ({id: film.id, score: film.score}))
    return {items, rest}
}

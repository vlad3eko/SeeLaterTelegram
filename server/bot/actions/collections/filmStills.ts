import {getTelegramMediaCache, setTelegramMediaCache} from '#server/global/engine/card/construct/getTelegramMediaCache'
import {mapLimit} from '#server/global/engine/collections/tmdb'
import {hasStillSearch, searchStills} from '#server/global/engine/collections/people/filmStills'
import type {BirthdayPerson, PersonRole} from '#server/global/engine/collections/people/birthdays'

/**
 * Кадры «актёр в фильме» для подборки именинника: rich-сообщению нужен file_id Telegram.
 * Найденный кадр бот отправляет в служебный канал и запоминает file_id (telegram_media_cache,
 * у боевого и тестового бота — свои) — повторный показ той же подборки Brave не тратит.
 * Не нашлось или Telegram не скачал — у фильма остаётся кадр TMDB.
 */

export type StillFilm = {id: number, title?: string, original_title?: string, year?: number | null, character?: string}

const cacheKeyOf = (personId: number, filmId: number) => `person_${personId}_still_${filmId}`
/** Где уже искали и не нашли — до перезапуска сервера не ищем снова (бережём бесплатные запросы). */
const notFound = new Set<string>()

const stillFor = async (ctx: any, person: BirthdayPerson, film: StillFilm): Promise<string | undefined> => {
    const key = cacheKeyOf(person.id, film.id)
    const cached = await getTelegramMediaCache(key).catch(() => null)
    if (cached) return cached
    if (notFound.has(key)) return undefined
    const title = film.original_title || film.title
    if (!title) return undefined

    let urls: string[] = []
    try {
        // Английское имя и оригинальное название находят настоящие кадры; без них — русские.
        urls = await searchStills(film.original_title ? person.en ?? person.name : person.name, title, film.year, {character: film.original_title ? film.character : undefined})
    } catch (error) {
        console.warn('[COLLECTIONS] Still search failed', {person: person.id, film: film.id, error: error instanceof Error ? error.message : error})
        return undefined
    }
    for (const url of urls.slice(0, 4)) {
        try {
            const message = await ctx.telegram.sendPhoto(process.env.TELEGRAM_MEDIA_STORAGE_CHAT_ID, url, {disable_notification: true})
            const fileId = message?.photo?.at(-1)?.file_id as string | undefined
            if (!fileId) continue
            await setTelegramMediaCache(key, fileId).catch(() => undefined)
            return fileId
        } catch {
            // Сайт не отдал картинку Telegram — следующая ссылка.
        }
    }
    notFound.add(key)
    return undefined
}

/**
 * file_id кадров по ID фильма (у кого не нашлось — нет в карте). Без ключа Brave — пусто;
 * у режиссёров тоже: самого режиссёра в кадре его фильма обычно нет.
 */
export const stillsFor = async (ctx: any, person: BirthdayPerson, role: PersonRole, films: StillFilm[]): Promise<Map<number, string>> => {
    const result = new Map<number, string>()
    if (!hasStillSearch() || role !== 'actor') return result
    const found = await mapLimit(films, 3, async film => [film.id, await stillFor(ctx, person, film)] as const)
    for (const [id, fileId] of found) if (fileId) result.set(id, fileId)
    return result
}

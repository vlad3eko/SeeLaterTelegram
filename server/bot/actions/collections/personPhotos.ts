import {getTelegramMediaCache, setTelegramMediaCache} from '#server/global/engine/card/construct/getTelegramMediaCache'
import {getTelegramMediaImages} from '#server/global/engine/card/construct/getTelegramPosterFileId'
import {mapLimit, tmdbGet} from '#server/global/engine/collections/tmdb'
import type {BirthdayPerson} from '#server/global/engine/collections/people/birthdays'

/**
 * Фото именинников для экрана «🎂 Именинники»: rich-сообщению нужен file_id Telegram.
 * Сначала портрет с Викисклада (пришёл из Wikidata вместе со списком — TMDB не нужен):
 * бот отправляет его по ссылке в служебный канал и запоминает file_id (telegram_media_cache,
 * у боевого и тестового бота — свои). Нет портрета или Telegram не скачал — фото профиля TMDB
 * (один запрос person/{id}, дальше та же загрузка и кеш, что у постеров карточек).
 */

const cacheKeyOf = (person: BirthdayPerson) => `person_${person.id}_wikiphoto`

const fromWikimedia = async (ctx: any, person: BirthdayPerson): Promise<string | undefined> => {
    if (!person.image) return undefined
    const key = cacheKeyOf(person)
    const cached = await getTelegramMediaCache(key).catch(() => null)
    if (cached) return cached
    try {
        const message = await ctx.telegram.sendPhoto(process.env.TELEGRAM_MEDIA_STORAGE_CHAT_ID, person.image, {disable_notification: true})
        const fileId = message?.photo?.at(-1)?.file_id as string | undefined
        if (fileId) await setTelegramMediaCache(key, fileId).catch(() => undefined)
        return fileId
    } catch (error: any) {
        console.warn('[COLLECTIONS] Portrait upload failed; TMDB photo', {id: person.id, error: error?.response?.description ?? error?.message})
        return undefined
    }
}

const fromTmdb = async (ctx: any, person: BirthdayPerson): Promise<string | undefined> => {
    try {
        const details = await tmdbGet<{profile_path?: string | null}>(`person/${person.id}?language=ru-RU`)
        const path = details.profile_path
        if (!path) return undefined
        const images = await getTelegramMediaImages(ctx, person.id, 'person', {poster: [path], postersList: []})
        return images.poster[0] ?? undefined
    } catch (error) {
        console.warn('[COLLECTIONS] TMDB photo failed', {id: person.id, error: error instanceof Error ? error.message : error})
        return undefined
    }
}

/** Список с file_id фото (у кого не нашлось — без фото). */
export const withPhotos = async (ctx: any, people: BirthdayPerson[]): Promise<BirthdayPerson[]> =>
    mapLimit(people, 3, async person => {
        if (person.photo) return person
        const photo = await fromWikimedia(ctx, person) ?? await fromTmdb(ctx, person)
        return photo ? {...person, photo} : person
    })

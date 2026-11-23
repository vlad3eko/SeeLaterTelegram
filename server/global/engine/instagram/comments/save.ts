import {createFavorite} from '#server/bot/services/supabase/addFavorite'
import {tmdbFetch} from '#server/utils/api/tmdbFetch'
import {isSubscribedToAll} from '#server/bot/handlers/channel/requiredChannels'
import type {IgMediaType} from '#server/global/engine/instagram/comments/messages'

/**
 * Сохранение тайтла из Instagram — тем же путём, что кнопка «Сохранить» в боте (createFavorite:
 * favorites + media_watch, дальше уведомления по сохранённым). Дубль проверяется заранее по
 * user_id + tmdb_id + media_type (фильм и сериал с одним TMDB id — разные тайтлы).
 */
export type SaveOutcome = 'saved' | 'already_saved'

export const saveTitleForUser = async (supabase: any, {userId, mediaId, mediaType}: {userId: number, mediaId: number, mediaType: IgMediaType}): Promise<SaveOutcome> => {
    const {data: existing, error: readError} = await supabase.from('favorites').select('id')
        .eq('user_id', userId).eq('tmdb_id', mediaId).eq('media_type', mediaType).limit(1)
    if (readError) throw readError
    if (existing?.length) return 'already_saved'

    const media: any = await tmdbFetch('/api/tmdb/media', {query: {id: mediaId, media: mediaType}})
    const {error} = await createFavorite(supabase, {
        userId,
        tmdbId: mediaId,
        title: media.title || media.name,
        mediaType,
        posterPath: media.poster_path || media.backdrop_path,
        voteAverage: media.vote_average || 0,
        voteCount: media.vote_count || 0,
        releaseDate: media.release_date || media.first_air_date,
        genresIds: media.genres
    })
    if (error?.code === '23505') {
        // Уникальный ключ (user_id, tmdb_id, media_type) — дубль того же тайтла. До миграции instagram_fixes.sql ключ
        // был без типа: конфликт мог дать тайтл другого типа с тем же id — тогда честно ошибка, а не «уже сохранён».
        const {data: same} = await supabase.from('favorites').select('id').eq('user_id', userId).eq('tmdb_id', mediaId).eq('media_type', mediaType).limit(1)
        if (same?.length) return 'already_saved'
        throw new Error('favorites: в коллекции тайтл другого типа с тем же TMDB id — нужна миграция instagram_fixes.sql')
    }
    if (error) throw error
    return 'saved'
}

/** Подписка на все обязательные каналы по Telegram id — как checkChannelSubscriber, но без контекста апдейта. */
export const isChannelMember = (telegram: any, telegramId: number): Promise<boolean> => isSubscribedToAll(telegram, telegramId)

/** Пользователь бота по Telegram id (строку создаёт saveTelegramUser при /start). */
export const userByTelegramId = async (supabase: any, telegramId: number): Promise<{id: number} | null> => {
    const {data, error} = await supabase.from('users').select('id').eq('telegram_id', telegramId).maybeSingle()
    if (error) throw error
    return data ?? null
}

/**
 * Итог привязки: linked — привязали сейчас; already — уже привязан к этому Telegram; elsewhere — привязан
 * к другому Telegram (не переносим); kept — у этого Telegram уже свой другой Instagram (не заменяем); none —
 * нечего привязывать или запись не удалась.
 */
export type LinkOutcome = 'linked' | 'already' | 'elsewhere' | 'kept' | 'none'

/**
 * Привязка Instagram к Telegram после перехода по своей ссылке — только при первом переходе (решение
 * владельца 23.11, вариант A): чужую привязку не переносим — ссылку из Direct мог открыть и не владелец
 * Instagram; перенос — /instagram_off в старом аккаунте. Фильм при этом сохраняется тому, кто открыл ссылку.
 * Человек снова нажал «Старт» — сводки по сохранённым опять доставляются (bot_blocked_at сбрасывается).
 */
export const linkInstagram = async (supabase: any, {telegramId, instagramId}: {telegramId: number, instagramId: string | null}): Promise<LinkOutcome> => {
    const {error: unblockError} = await supabase.from('users').update({bot_blocked_at: null}).eq('telegram_id', telegramId)
    if (unblockError) console.warn('[IG START] bot_blocked_at не сброшен', unblockError.message)
    if (!instagramId) return 'none'

    const {data: owner, error: ownerError} = await supabase.from('users').select('telegram_id').eq('instagram_id', instagramId).maybeSingle()
    if (ownerError) {
        console.warn('[IG START] привязка Instagram не проверена', ownerError.message)
        return 'none'
    }
    if (owner) return Number(owner.telegram_id) === telegramId ? 'already' : 'elsewhere'

    const {data: linked, error} = await supabase.from('users')
        .update({instagram_id: instagramId, instagram_linked_at: new Date().toISOString()})
        .eq('telegram_id', telegramId).is('instagram_id', null).select('id')
    // 23505 — тот же Instagram только что привязали к другому Telegram (уникальный индекс users_instagram_id).
    if (error?.code === '23505') return 'elsewhere'
    if (error) {
        console.warn('[IG START] привязка Instagram не сохранена', error.message)
        return 'none'
    }
    return linked?.length ? 'linked' : 'kept'
}

/** /instagram_off: отвязать Instagram от этого Telegram. false — привязки не было. */
export const unlinkInstagram = async (supabase: any, telegramId: number): Promise<boolean> => {
    const {data, error} = await supabase.from('users').update({instagram_id: null, instagram_linked_at: null})
        .eq('telegram_id', telegramId).not('instagram_id', 'is', null).select('id')
    if (error) throw error
    return Boolean(data?.length)
}

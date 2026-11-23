import {createFavorite} from '#server/bot/services/supabase/addFavorite'
import {tmdbFetch} from '#server/utils/api/tmdbFetch'
import {TELEGRAM_CHANEL_LINK} from '#server/global/oneLinkApp'
import type {IgMediaType} from '#server/global/engine/instagram/comments/messages'

/**
 * Сохранение тайтла из Instagram — тем же путём, что кнопка «Сохранить» в боте (createFavorite:
 * favorites + media_watch, дальше уведомления по сохранённым). Дубль проверяется заранее по
 * user_id + tmdb_id + media_type: уникальный ключ favorites не включает media_type.
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
    if (error?.code === '23505') return 'already_saved'
    if (error) throw error
    return 'saved'
}

/** Подписка на канал по Telegram id — как checkChannelSubscriber, но без контекста апдейта. */
export const isChannelMember = async (telegram: any, telegramId: number): Promise<boolean> => {
    try {
        const member = await telegram.getChatMember(TELEGRAM_CHANEL_LINK, telegramId)
        return ['member', 'administrator', 'creator'].includes(member.status)
    } catch {
        return false
    }
}

/** Пользователь бота по Telegram id (строку создаёт saveTelegramUser при /start). */
export const userByTelegramId = async (supabase: any, telegramId: number): Promise<{id: number} | null> => {
    const {data, error} = await supabase.from('users').select('id').eq('telegram_id', telegramId).maybeSingle()
    if (error) throw error
    return data ?? null
}

/**
 * Привязка Instagram к Telegram после перехода по своей ссылке. Если этот Instagram был привязан к
 * другому Telegram — привязка переезжает (ссылка пришла в Direct этого Instagram, свежее подтверждение).
 * Человек снова нажал «Старт» — сводки по сохранённым опять доставляются (bot_blocked_at сбрасывается).
 */
export const linkInstagram = async (supabase: any, {telegramId, instagramId}: {telegramId: number, instagramId: string | null}): Promise<boolean> => {
    const now = new Date().toISOString()
    if (instagramId) {
        await supabase.from('users').update({instagram_id: null, instagram_linked_at: null})
            .eq('instagram_id', instagramId).neq('telegram_id', telegramId)
    }
    const {error} = await supabase.from('users')
        .update({...(instagramId ? {instagram_id: instagramId, instagram_linked_at: now} : {}), bot_blocked_at: null})
        .eq('telegram_id', telegramId)
    if (error) console.warn('[IG START] привязка Instagram не сохранена', error.message)
    return !error && Boolean(instagramId)
}

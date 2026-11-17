import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {isAdmin} from '#server/bot/consts/admins'
import type {CollectionCriterion} from '#server/global/engine/collections/buildCollection'
import type {Direction, SectionKey} from '#server/global/engine/collections/catalog'

/**
 * Состояние мастера подборки /g (таблица collection_wizard, одна строка на пользователя).
 * Экран и выбор живут здесь: в callback_data Telegram помещается только 64 байта.
 */

export type WizardScreen = 'root' | 'series' | 'criterion' | 'filter' | 'direction' | 'period'

/** Раздел верхнего меню (схема владельца 17.11). Этап 1: фильмы и сериалы, остальное — позже. */
export type SectionGroup = 'movies' | 'series' | 'cartoons' | 'cseries' | 'anime' | 'people'

export type WizardState = {
    screen: WizardScreen
    group?: SectionGroup
    section?: SectionKey
    criterion?: CollectionCriterion
    genres: string[]
    tags: string[]
    openGenres: boolean
    openTags: boolean
    direction?: Direction
}

export type WizardRow = {
    telegramId: number
    chatId?: number
    messageId?: number
    state: WizardState
}

export const emptyState = (): WizardState => ({
    screen: 'root',
    genres: [],
    tags: [],
    openGenres: true,
    openTags: false
})

/**
 * Кто может открывать подборки. Сейчас — только админ; позже здесь будет проверка подписки
 * (подписчики получают карточки для себя, без кнопок публикации).
 */
export const canUseCollections = (telegramId: number): boolean => isAdmin(telegramId)

/** Кнопки публикации («Собрать карусель») — только админ, даже у подписчиков. */
export const canPublishCollections = (telegramId: number): boolean => isAdmin(telegramId)

export const loadWizard = async (telegramId: number): Promise<WizardRow> => {
    const {data, error} = await getSupabase()
        .from('collection_wizard')
        .select('chat_id,message_id,state')
        .eq('telegram_id', telegramId)
        .maybeSingle()
    if (error) throw new Error(`[COLLECTIONS WIZARD] ${error.message}`)

    return {
        telegramId,
        ...(data?.chat_id ? {chatId: Number(data.chat_id)} : {}),
        ...(data?.message_id ? {messageId: Number(data.message_id)} : {}),
        state: {...emptyState(), ...(data?.state ?? {})}
    }
}

export const saveWizard = async (row: WizardRow): Promise<void> => {
    const {error} = await getSupabase()
        .from('collection_wizard')
        .upsert({
            telegram_id: row.telegramId,
            chat_id: row.chatId ?? null,
            message_id: row.messageId ?? null,
            state: row.state,
            updated_at: new Date().toISOString()
        }, {onConflict: 'telegram_id'})
    if (error) throw new Error(`[COLLECTIONS WIZARD] ${error.message}`)
}

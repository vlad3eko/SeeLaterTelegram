import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {isAdmin} from '#server/bot/consts/admins'
import type {CollectionCriterion} from '#server/global/engine/collections/buildCollection'
import type {Direction, SectionKey, YearRangeKey} from '#server/global/engine/collections/catalog'
import type {ShelfKey} from '#server/global/engine/collections/shelves'
import type {BirthdayPerson, PersonLife, PersonRole} from '#server/global/engine/collections/people/birthdays'

/**
 * Состояние мастера подборки /g (таблица collection_wizard, одна строка на пользователя).
 * Экран и выбор живут здесь: в callback_data Telegram помещается только 64 байта.
 */

/** home — режимы /g; result — меню превратилось в подборку; title — открыт тайтл из подборки. */
export type WizardScreen = 'home' | 'root' | 'format' | 'series' | 'criterion' | 'filter' | 'bundles' | 'direction' | 'period' | 'result' | 'title'
    // «🎭 Актёры и режиссёры»: роль → живые/ушедшие → «Искать» → именинники дня.
    | 'people' | 'peopleLife' | 'peopleSearch' | 'birthdays'

/** Раздел верхнего меню (схема владельца 17.11; дунхуа — отдельной полкой, 19.11). format — у аниме и дунхуа: фильмы или сериалы. */
export type SectionGroup = 'movies' | 'series' | 'cartoons' | 'cseries' | 'anime' | 'donghua' | 'people'

export type WizardState = {
    screen: WizardScreen
    group?: SectionGroup
    /** Полка (что смотрим): без неё — живое кино по группе (старые сохранённые меню). */
    shelf?: ShelfKey
    section?: SectionKey
    criterion?: CollectionCriterion
    /** Выбранная связка (criterion bundle). */
    bundle?: string
    genres: string[]
    tags: string[]
    openGenres: boolean
    openTags: boolean
    /** Блок «Год» фильтра: один вариант или ничего. */
    year?: YearRangeKey
    openYear: boolean
    direction?: Direction
    /** Подборка, в которую превратилось сообщение мастера (screen result/title). */
    collectionId?: string
    /** Открытый тайтл (номер на странице подборки) — для «🔗 Похожее». */
    titleIndex?: number
    /** «Актёры и режиссёры»: кого ищем и найденные именинники (до 10, из Wikidata). */
    personRole?: PersonRole
    personLife?: PersonLife
    birthdays?: BirthdayPerson[]
}

export type WizardRow = {
    telegramId: number
    chatId?: number
    messageId?: number
    state: WizardState
}

export const emptyState = (): WizardState => ({
    screen: 'home',
    genres: [],
    tags: [],
    openGenres: true,
    openTags: false,
    openYear: false
})

/**
 * Доступ к /g без прав админа (решение владельца 18.11): видят подборки и карточки,
 * но без админских кнопок и без публикации.
 */
const COLLECTION_USERS: number[] = [890040557, 8904891249]

/**
 * Кто может открывать подборки. Сейчас — админ и COLLECTION_USERS; позже здесь будет проверка
 * подписки (подписчики получают карточки для себя, без кнопок публикации).
 */
export const canUseCollections = (telegramId: number): boolean =>
    isAdmin(telegramId) || COLLECTION_USERS.includes(telegramId)

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

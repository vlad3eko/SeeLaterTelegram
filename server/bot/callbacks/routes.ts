import {defineCallback, defineStaticCallback} from "#server/bot/callbacks/defineCallback"
import {isYouTubeVideoId} from "#server/global/engine/instagram/reel/utils/extractYouTubeVideoId"
import type {ContentStrategy, ContentTelegramMenu} from "~/utils/engines/content/strategy/enums"
import type {ContentType} from "#server/global/engine/search/strategy/enums"

/**
 * Все callback-кнопки бота. Кнопки (`server/bot/consts/buttons/`) собирают данные через
 * `encode`, обработчики регистрируются по `pattern` (`server/bot/actions/**\/register*.ts`)
 * и читают параметры через `parse`.
 *
 * Шаблоны и порядок групп существующих кнопок совпадают с прежними регулярками: сообщения,
 * уже отправленные в чаты и в канал, продолжают работать после выкатки.
 */

type MediaType = 'movie' | 'tv'

// Ключ трейлера в данных кнопки. Пустой ключ кодируется как `none`; старые кнопки
// содержат `undefined` (раньше в шаблон подставлялось `${undefined}`). Всё, что не
// является настоящим ID видео YouTube, разбирается как «ключа нет».
const NO_TRAILER = 'none'

const encodeTrailerKey = (keyTrailer: string | undefined): string =>
    isYouTubeVideoId(keyTrailer) ? keyTrailer : NO_TRAILER

const decodeTrailerKey = (value: string | undefined): string | undefined =>
    isYouTubeVideoId(value) ? value : undefined

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

// ---------------------------------------------------------------------------
// Карточка фильма: сохранить / удалить из библиотеки
// ---------------------------------------------------------------------------

export type MediaRef = {mediaId: number, mediaType: MediaType}

export const SAVE_MEDIA = defineCallback<MediaRef>({
    id: 'save_media',
    pattern: /^save_media_(\d+)_(movie|tv)$/,
    encode: ({mediaId, mediaType}) => `save_media_${mediaId}_${mediaType}`,
    decode: match => ({mediaId: Number(match[1]), mediaType: match[2] as MediaType})
})

export const DELETE_MEDIA = defineCallback<MediaRef>({
    id: 'delete_media',
    pattern: /^delete_media_(\d+)_(movie|tv)$/,
    encode: ({mediaId, mediaType}) => `delete_media_${mediaId}_${mediaType}`,
    decode: match => ({mediaId: Number(match[1]), mediaType: match[2] as MediaType})
})

// ---------------------------------------------------------------------------
// Админ: карточка
// ---------------------------------------------------------------------------

export type AdminCardRef = MediaRef & {
    contentType: ContentType
    keyTrailer: string | undefined
}

export const ADMIN_EDIT_CARD = defineCallback<AdminCardRef>({
    id: 'edit_media',
    pattern: /^edit_media_(\d+)_(movie|tv)_([^_]+)(?:_(.+))?$/,
    encode: ({mediaId, mediaType, contentType, keyTrailer}) =>
        `edit_media_${mediaId}_${mediaType}_${contentType}_${encodeTrailerKey(keyTrailer)}`,
    decode: match => ({
        mediaId: Number(match[1]),
        mediaType: match[2] as MediaType,
        contentType: (match[3] ?? '') as ContentType,
        keyTrailer: decodeTrailerKey(match[4])
    })
})

export type AdminPublishRef = AdminCardRef & {isRichTypeCard: boolean}

export const ADMIN_PUBLISH_CARD = defineCallback<AdminPublishRef>({
    id: 'publish_media',
    pattern: /^publish_media_(\d+)_(movie|tv)_([^_]+)(?:_(.+?))?(?:_(true|false))?$/,
    encode: ({mediaId, mediaType, contentType, keyTrailer, isRichTypeCard}) =>
        `publish_media_${mediaId}_${mediaType}_${contentType}_${encodeTrailerKey(keyTrailer)}_${isRichTypeCard}`,
    decode: match => ({
        mediaId: Number(match[1]),
        mediaType: match[2] as MediaType,
        contentType: (match[3] ?? '') as ContentType,
        keyTrailer: decodeTrailerKey(match[4]),
        isRichTypeCard: match[5] === 'true'
    })
})

/**
 * Тип видео по ссылке, которую администратор прислал вручную («Изменить ключ трейлера»):
 * trailer — квадрат по центру, как всегда; clip — нарезка/фрагмент: исходник хранится
 * в R2 до полной публикации (дальше — слежение за лицом по X).
 */
export type SourceVideoType = 'trailer' | 'clip'

export const ADMIN_VIDEO_TYPE = defineCallback<{videoType: SourceVideoType}>({
    id: 'admin_video_type',
    pattern: /^admin_video_type_(trailer|clip)$/,
    encode: ({videoType}) => `admin_video_type_${videoType}`,
    decode: match => ({videoType: match[1] as SourceVideoType})
})

// Меню «Редактировать» (editMediaChoiceKeyboard).
export const ADMIN_DOWNLOAD_TRAILER = defineStaticCallback('download_trailer', 'download_trailer')
export const ADMIN_CHANGE_TRAILER_KEY = defineStaticCallback('update_trailer_key', 'update_trailer_key')
export const ADMIN_EDIT_MEDIA = defineStaticCallback('admin_edit_media', 'admin_edit_media')
export const ADMIN_EDIT_TEXT = defineStaticCallback('admin_edit_text', 'admin_edit_text')
export const ADMIN_EDIT_OVERVIEW = defineStaticCallback('admin_edit_overview', 'admin_edit_overview')
export const ADMIN_EDIT_TYPE = defineStaticCallback('admin_edit_type_card', 'admin_edit_type_card')

// ---------------------------------------------------------------------------
// Админ: проверка Reel перед публикацией (ручная ветка, см. TASKS.md)
// ---------------------------------------------------------------------------

export type ReelReviewRef = {jobId: string}

/** «🔁 Пересобрать»: новый clean из уже скачанного трейлера. */
export const REEL_REVIEW_REBUILD = defineCallback<ReelReviewRef>({
    id: 'reel_review_rebuild',
    pattern: new RegExp(`^rr:rebuild:(${UUID})$`),
    encode: ({jobId}) => `rr:rebuild:${jobId}`,
    decode: match => ({jobId: match[1] ?? ''})
})

/** «✨ Сгенерировать хук»: 4 варианта от Gemini по текущему clean. */
export const REEL_REVIEW_HOOKS = defineCallback<ReelReviewRef>({
    id: 'reel_review_hooks',
    pattern: new RegExp(`^rr:hooks:(${UUID})$`),
    encode: ({jobId}) => `rr:hooks:${jobId}`,
    decode: match => ({jobId: match[1] ?? ''})
})

/** «✖️ Отменить»: остановить весь цикл проверки, ничего не публиковать. */
export const REEL_REVIEW_CANCEL = defineCallback<ReelReviewRef>({
    id: 'reel_review_cancel',
    pattern: new RegExp(`^rr:cancel:(${UUID})$`),
    encode: ({jobId}) => `rr:cancel:${jobId}`,
    decode: match => ({jobId: match[1] ?? ''})
})

/** «🔁 Новые варианты»: Gemini заново пишет варианты хука по тому же clean. */
export const REEL_REVIEW_REGEN_HOOKS = defineCallback<ReelReviewRef>({
    id: 'reel_review_regen_hooks',
    pattern: new RegExp(`^rr:rehook:(${UUID})$`),
    encode: ({jobId}) => `rr:rehook:${jobId}`,
    decode: match => ({jobId: match[1] ?? ''})
})

/** «✍️ Свой вариант»: следующее сообщение администратора в чате станет хуком. */
export const REEL_REVIEW_CUSTOM_HOOK = defineCallback<ReelReviewRef>({
    id: 'reel_review_custom_hook',
    pattern: new RegExp(`^rr:myhook:(${UUID})$`),
    encode: ({jobId}) => `rr:myhook:${jobId}`,
    decode: match => ({jobId: match[1] ?? ''})
})

/** «◀️ К вариантам»: выйти из ввода своего хука обратно к вариантам Gemini. */
export const REEL_REVIEW_HOOK_BACK = defineCallback<ReelReviewRef>({
    id: 'reel_review_hook_back',
    pattern: new RegExp(`^rr:hookback:(${UUID})$`),
    encode: ({jobId}) => `rr:hookback:${jobId}`,
    decode: match => ({jobId: match[1] ?? ''})
})

/** «✅ Опубликовать» под своим хуком: хук подтверждён, воркер собирает Reel. */
export const REEL_REVIEW_CONFIRM_HOOK = defineCallback<ReelReviewRef>({
    id: 'reel_review_confirm_hook',
    pattern: new RegExp(`^rr:hookok:(${UUID})$`),
    encode: ({jobId}) => `rr:hookok:${jobId}`,
    decode: match => ({jobId: match[1] ?? ''})
})

/** «✏️ Изменить» под своим хуком: бот снова ждёт текст хука. */
export const REEL_REVIEW_EDIT_HOOK = defineCallback<ReelReviewRef>({
    id: 'reel_review_edit_hook',
    pattern: new RegExp(`^rr:hookedit:(${UUID})$`),
    encode: ({jobId}) => `rr:hookedit:${jobId}`,
    decode: match => ({jobId: match[1] ?? ''})
})

/** Номер фрагмента нарезки (1–8, сквозной по страницам альбома). */
export const REEL_REVIEW_PICK_FRAGMENT = defineCallback<ReelReviewRef & {fragment: number}>({
    id: 'reel_review_fragment',
    pattern: new RegExp(`^rr:frag:(${UUID}):([1-8])$`),
    encode: ({jobId, fragment}) => `rr:frag:${jobId}:${fragment}`,
    decode: match => ({jobId: match[1] ?? '', fragment: Number(match[2])})
})

/** Страница альбома фрагментов: «Следующие варианты» / «◀️ Назад». */
export const REEL_REVIEW_FRAGMENT_PAGE = defineCallback<ReelReviewRef & {page: number}>({
    id: 'reel_review_fragment_page',
    pattern: new RegExp(`^rr:fpage:(${UUID}):([0-9])$`),
    encode: ({jobId, page}) => `rr:fpage:${jobId}:${page}`,
    decode: match => ({jobId: match[1] ?? '', page: Number(match[2])})
})

export const REEL_HOOK_OPTIONS_MAX = 4

/** «1»…«4»: выбранный вариант хука (номер с единицы, как в сообщении). */
export const REEL_REVIEW_PICK_HOOK = defineCallback<ReelReviewRef & {option: number}>({
    id: 'reel_review_pick',
    pattern: new RegExp(`^rr:pick:(${UUID}):([1-${REEL_HOOK_OPTIONS_MAX}])$`),
    encode: ({jobId, option}) => `rr:pick:${jobId}:${option}`,
    decode: match => ({jobId: match[1] ?? '', option: Number(match[2])})
})

// ---------------------------------------------------------------------------
// Подписка на канал
// ---------------------------------------------------------------------------

export const CHECK_SUBSCRIPTION = defineStaticCallback('check_sub', 'check_sub')

// ---------------------------------------------------------------------------
// Контент-движок админа (/g)
// ---------------------------------------------------------------------------

export const CONTENT_STRATEGY = defineCallback<{strategy: ContentStrategy, userId: number}>({
    id: 'content_strategy',
    pattern: /^content_([A-Z_]+)_(\d+)$/,
    encode: ({strategy, userId}) => `content_${strategy}_${userId}`,
    decode: match => ({strategy: match[1] as ContentStrategy, userId: Number(match[2])})
})

export const CONTENT_MENU = defineCallback<{menu: ContentTelegramMenu}>({
    id: 'content_menu',
    pattern: /^content_chosen_([A-Z_]+)$/,
    encode: ({menu}) => `content_chosen_${menu}`,
    decode: match => ({menu: match[1] as ContentTelegramMenu})
})

export const CONTENT_LIST_CARD = defineCallback<{mediaType: string, contentType: string, mediaId: string}>({
    id: 'content_list_card',
    pattern: /^bot:([^:]+):([^:]+):([^:]+)$/,
    encode: ({mediaType, contentType, mediaId}) => `bot:${mediaType}:${contentType}:${mediaId}`,
    decode: match => ({mediaType: match[1] ?? '', contentType: match[2] ?? '', mediaId: match[3] ?? ''})
})

// ---------------------------------------------------------------------------
// Только для старых сообщений: обработчики зарегистрированы, но кнопок с такими
// данными в коде больше нет (проверено 11.11). Удалять, когда старые сообщения
// с ними гарантированно исчезнут из чатов.
// ---------------------------------------------------------------------------

export const LEGACY_MENU_BOT = defineStaticCallback('menu_bot', 'menu_bot')

export const LEGACY_BACK = defineCallback<{count: number}>({
    id: 'back',
    pattern: /^back_(\d+)$/,
    encode: ({count}) => `back_${count}`,
    decode: match => ({count: Number(match[1] ?? 0)})
})

export const LEGACY_DELETE_ALL = defineCallback<{count: number}>({
    id: 'delete_all',
    pattern: /^delete_all_(\d+)$/,
    encode: ({count}) => `delete_all_${count}`,
    decode: match => ({count: Number(match[1] ?? 0)})
})

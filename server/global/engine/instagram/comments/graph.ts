import {instagramGraphUrl} from '#server/global/publishers/instagram/instagramGraphUrl'

/**
 * Запросы к Instagram Graph API для «СОХРАНИТЬ» (проверено на аккаунте 23.11, токен EAA →
 * graph.facebook.com): свои Reels, комментарии к Reel, Private Reply на комментарий, ответ под ним.
 * Webhook комментариев к Reels Meta не поддерживает — поэтому опрос.
 * Токен не логируется; ошибка — код, подкод и класс для решения «повторять или нет».
 */
export type GraphErrorKind = 'rate' | 'already' | 'denied' | 'token' | 'config' | 'unknown'

export type GraphResult<T> =
    | {ok: true, data: T}
    | {ok: false, kind: GraphErrorKind, status: number, code?: number, subcode?: number, message: string}

/** Лимиты: ответ не израсходован, повторить позже. */
const RATE_CODES = new Set([4, 17, 32, 368, 613, 80002])
/** Ответ на комментарий уже был (Meta: один Private Reply на комментарий). */
const ALREADY_SUBCODES = new Set([2534023])

/** Подкоды Private Reply про конкретный комментарий (окно, нельзя ответить, нет автора) — не настройка аккаунта. */
const isPerCommentSubcode = (subcode?: number) => subcode !== undefined && subcode >= 2534000 && subcode < 2535000

/**
 * Класс ошибки.
 * «token» — токен истёк или отозван (190); «config» — у приложения нет прав или возможности (10, 3, 200–299
 * без подкода про комментарий). Обе общие для всех записей: их не списывают на комментарий — запись ждёт
 * исправления, администратор получает предупреждение.
 * «unknown» — таймаут, сеть, 5xx, коды 1/2: Meta могла принять сообщение,
 * повторять вслепую нельзя (второй Direct тому же человеку).
 */
export const classifyGraphError = ({status, code, subcode}: {status: number, code?: number, subcode?: number}): GraphErrorKind => {
    if (code !== undefined && RATE_CODES.has(code)) return 'rate'
    if (subcode !== undefined && ALREADY_SUBCODES.has(subcode)) return 'already'
    if (code === 190) return 'token'
    if (!isPerCommentSubcode(subcode) && (code === 10 || code === 3 || (code !== undefined && code >= 200 && code < 300))) return 'config'
    if (!status || status >= 500 || code === 1 || code === 2) return 'unknown'
    return 'denied'
}

/**
 * Расход лимита Instagram из заголовка X-Business-Use-Case-Usage последнего ответа (в пределах одного запуска функции):
 * percent — наибольший из call_count / total_cputime / total_time, regainMinutes — сколько ждать, если Meta уже ограничила.
 */
export type IgUsage = {percent: number, regainMinutes: number}
let lastUsage: IgUsage | null = null
export const instagramUsage = (): IgUsage | null => lastUsage

export const parseBucUsage = (header: string | null | undefined): IgUsage | null => {
    if (!header) return null
    try {
        const rows = Object.values(JSON.parse(header)).flat() as any[]
        const row = rows.find(item => item?.type === 'instagram') ?? rows[0]
        if (!row) return null
        return {
            percent: Math.max(Number(row.call_count) || 0, Number(row.total_cputime) || 0, Number(row.total_time) || 0),
            regainMinutes: Number(row.estimated_time_to_regain_access) || 0
        }
    } catch {
        return null
    }
}

const credentials = () => {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim()
    const account = process.env.INSTAGRAM_ACCOUNT_ID?.trim()
    return token && account ? {token, account} : null
}

export const instagramAccountId = (): string | null => credentials()?.account ?? null

const graphRequest = async <T>(path: string, {query, body}: {query?: Record<string, string>, body?: unknown} = {}): Promise<GraphResult<T>> => {
    const auth = credentials()
    if (!auth) return {ok: false, kind: 'token', status: 0, message: 'нет INSTAGRAM_ACCESS_TOKEN или INSTAGRAM_ACCOUNT_ID'}
    const url = new URL(`${instagramGraphUrl(auth.token)}/${path}`)
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)
    try {
        const response = await fetch(url, {
            method: body ? 'POST' : 'GET',
            headers: {Authorization: `Bearer ${auth.token}`, ...(body ? {'content-type': 'application/json'} : {})},
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(15_000)
        })
        lastUsage = parseBucUsage(response.headers.get('x-business-use-case-usage')) ?? lastUsage
        const json = await response.json().catch(() => ({})) as any
        if (response.ok && !json?.error) return {ok: true, data: json as T}
        const error = json?.error ?? {}
        const failure = {status: response.status, code: error.code, subcode: error.error_subcode}
        return {ok: false, kind: classifyGraphError(failure), ...failure, message: String(error.message ?? response.statusText).slice(0, 200)}
    } catch (error: any) {
        return {ok: false, kind: 'unknown', status: 0, message: String(error?.message ?? error).slice(0, 200)}
    }
}

export const graphFailureText = (result: Extract<GraphResult<unknown>, {ok: false}>): string =>
    `${result.kind} HTTP ${result.status}${result.code !== undefined ? ` code=${result.code}` : ''}${result.subcode ? `/${result.subcode}` : ''}: ${result.message}`

/** Ошибка общая для всего аккаунта (токен или права) — текст graphFailureText начинается с класса. */
export const isAccountFailureText = (text: string): boolean => /^(token|config) /.test(text)

/** Ошибка токена или прав Meta из любого шага — общая для всех кампаний, чинит только владелец. */
export const accountFailure = (result: Record<string, any>): string | null =>
    [result.discover?.error, ...(result.poll?.errors ?? []), result.send?.accountError]
        .find((text): text is string => typeof text === 'string' && isAccountFailureText(text)) ?? null

/** Объект Meta не существует или недоступен (Reel удалён): code 100, подкод 33. */
export const isMissingObject = (result: {code?: number, subcode?: number}): boolean => result.code === 100 && result.subcode === 33

export type IgMedia = {id: string, media_product_type?: string, caption?: string, permalink?: string, timestamp: string}
export type IgComment = {id: string, text?: string, timestamp: string, from?: {id?: string}}
type IgCommentWithReplies = IgComment & {replies?: {data?: IgComment[]}}

const COMMENT_FIELDS = 'id,text,timestamp,from{id}'

/** Комментарии верхнего уровня и ответы в их ветках — одним списком. */
export const flattenReplies = (batch: IgCommentWithReplies[]): IgComment[] =>
    batch.flatMap(({replies, ...comment}) => [comment, ...(replies?.data ?? [])])

/** Последние публикации аккаунта (Reels и прочее), новые первыми. */
export const listRecentMedia = async (limit = 10): Promise<GraphResult<IgMedia[]>> => {
    const account = instagramAccountId()
    const result = await graphRequest<{data?: IgMedia[]}>(`${account}/media`, {
        query: {fields: 'id,media_product_type,caption,permalink,timestamp', limit: String(limit)}
    })
    return result.ok ? {ok: true, data: result.data.data ?? []} : result
}

/**
 * Комментарии, новые первыми (фильтра по времени у Meta нет): страницы по 50, пока не дойдём до
 * `stopBefore` или не исчерпаем `maxPages`. Ответы в ветках («СОХРАНИТЬ» ответом на чужой комментарий)
 * приходят вложенными `replies` и разворачиваются в общий список; ответ в ветке комментария старше
 * отметки «прочитано до» не увидим — Meta сортирует только верхний уровень.
 * `truncated` — остались непрочитанные (ошибка на середине или лимит страниц): отметку «прочитано до»
 * тогда не сдвигают, следующий проход перечитает с той же границы.
 */
export const listComments = async (mediaId: string, {stopBefore, maxPages = 20}: {stopBefore: number, maxPages?: number}): Promise<GraphResult<{comments: IgComment[], truncated: boolean}>> => {
    const comments: IgComment[] = []
    let after: string | undefined
    for (let page = 0; page < maxPages; page++) {
        const result = await graphRequest<{data?: IgCommentWithReplies[], paging?: {cursors?: {after?: string}, next?: string}}>(`${mediaId}/comments`, {
            query: {fields: `${COMMENT_FIELDS},replies{${COMMENT_FIELDS}}`, limit: '50', ...(after ? {after} : {})}
        })
        if (!result.ok) return comments.length ? {ok: true, data: {comments, truncated: true}} : result
        const batch = result.data.data ?? []
        comments.push(...flattenReplies(batch))
        const oldest = batch.at(-1)
        const reachedStop = !oldest || Date.parse(oldest.timestamp) < stopBefore
        after = result.data.paging?.next ? result.data.paging.cursors?.after : undefined
        if (reachedStop || !after) return {ok: true, data: {comments, truncated: false}}
    }
    return {ok: true, data: {comments, truncated: true}}
}

/** Private Reply: Direct автору комментария, один раз на комментарий, в течение 7 дней. */
export const sendPrivateReply = async (commentId: string, text: string): Promise<GraphResult<{message_id?: string, recipient_id?: string}>> =>
    graphRequest(`${instagramAccountId()}/messages`, {body: {recipient: {comment_id: commentId}, message: {text}}})

/** Публичный ответ под комментарием (автору приходит уведомление). */
export const replyToComment = async (commentId: string, message: string): Promise<GraphResult<{id?: string}>> =>
    graphRequest(`${commentId}/replies`, {body: {message}})

import {instagramGraphUrl} from '#server/global/publishers/instagram/instagramGraphUrl'

/**
 * Запросы к Instagram Graph API для «СОХРАНИТЬ» (проверено на аккаунте 23.11, токен EAA →
 * graph.facebook.com): свои Reels, комментарии к Reel, Private Reply на комментарий, ответ под ним.
 * Webhook комментариев к Reels Meta не поддерживает — поэтому опрос.
 * Токен не логируется; ошибка — код, подкод и класс для решения «повторять или нет».
 */
export type GraphErrorKind = 'rate' | 'already' | 'denied' | 'token' | 'unknown'

export type GraphResult<T> =
    | {ok: true, data: T}
    | {ok: false, kind: GraphErrorKind, status: number, code?: number, subcode?: number, message: string}

/** Лимиты: ответ не израсходован, повторить позже. */
const RATE_CODES = new Set([4, 17, 32, 368, 613, 80002])
/** Ответ на комментарий уже был (Meta: один Private Reply на комментарий). */
const ALREADY_SUBCODES = new Set([2534023])

/**
 * Класс ошибки. «unknown» — таймаут, сеть, 5xx, коды 1/2: Meta могла принять сообщение,
 * повторять вслепую нельзя (второй Direct тому же человеку).
 */
export const classifyGraphError = ({status, code, subcode}: {status: number, code?: number, subcode?: number}): GraphErrorKind => {
    if (code !== undefined && RATE_CODES.has(code)) return 'rate'
    if (subcode !== undefined && ALREADY_SUBCODES.has(subcode)) return 'already'
    if (code === 190) return 'token'
    if (!status || status >= 500 || code === 1 || code === 2) return 'unknown'
    return 'denied'
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

export type IgMedia = {id: string, media_product_type?: string, caption?: string, permalink?: string, timestamp: string}
export type IgComment = {id: string, text?: string, timestamp: string, from?: {id?: string}}

/** Последние публикации аккаунта (Reels и прочее), новые первыми. */
export const listRecentMedia = async (limit = 10): Promise<GraphResult<IgMedia[]>> => {
    const account = instagramAccountId()
    const result = await graphRequest<{data?: IgMedia[]}>(`${account}/media`, {
        query: {fields: 'id,media_product_type,caption,permalink,timestamp', limit: String(limit)}
    })
    return result.ok ? {ok: true, data: result.data.data ?? []} : result
}

/**
 * Комментарии верхнего уровня, новые первыми (фильтра по времени у Meta нет): страницы по 50,
 * пока не дойдём до `stopBefore` или не исчерпаем `maxPages`. `truncated` — остались непрочитанные.
 */
export const listComments = async (mediaId: string, {stopBefore, maxPages = 4}: {stopBefore: number, maxPages?: number}): Promise<GraphResult<{comments: IgComment[], truncated: boolean}>> => {
    const comments: IgComment[] = []
    let after: string | undefined
    for (let page = 0; page < maxPages; page++) {
        const result = await graphRequest<{data?: IgComment[], paging?: {cursors?: {after?: string}, next?: string}}>(`${mediaId}/comments`, {
            query: {fields: 'id,text,timestamp,from{id}', limit: '50', ...(after ? {after} : {})}
        })
        if (!result.ok) return comments.length ? {ok: true, data: {comments, truncated: true}} : result
        const batch = result.data.data ?? []
        comments.push(...batch)
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

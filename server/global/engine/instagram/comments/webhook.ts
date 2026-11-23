import {createHmac, timingSafeEqual} from 'node:crypto'
import {matchesKeyword} from '#server/global/engine/instagram/comments/keyword'

/**
 * Вебхук комментариев Instagram (Meta App → Instagram → Webhooks, поле comments) — ускоритель опроса:
 * событие с «СОХРАНИТЬ» под Reel делает его кампанию «пора опросить» и сразу запускает обычный проход
 * (тот же код, что у таймера: опрос → очередь → Direct). Таймер остаётся страховкой — вебхук Meta может
 * не дойти, а в режиме разработки приложения приходит только по людям с ролью в приложении.
 * Из события берётся только id Reel: комментарий всё равно перечитывается через API.
 */

/** GET-проверка подписки: hub.mode=subscribe и наш проверочный токен → вернуть hub.challenge. */
export const verifySubscription = (query: Record<string, unknown>, expectedToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim()): string | null => {
    const token = String(query['hub.verify_token'] ?? '')
    const challenge = query['hub.challenge']
    if (!expectedToken || query['hub.mode'] !== 'subscribe' || challenge === undefined) return null
    const received = Buffer.from(token)
    const expected = Buffer.from(expectedToken)
    return received.length === expected.length && timingSafeEqual(received, expected) ? String(challenge) : null
}

/**
 * Подпись POST: X-Hub-Signature-256 = sha256=HMAC(тело, секрет приложения). Секретов два кандидата:
 * секрет Instagram-приложения (вход через Instagram) и секрет приложения Meta — подходит любой заданный.
 */
export const signatureValid = (rawBody: string, header: string | undefined, secrets = [process.env.INSTAGRAM_APP_SECRET, process.env.META_APP_SECRET]): boolean => {
    if (!header?.startsWith('sha256=')) return false
    const received = Buffer.from(header.slice(7), 'hex')
    return secrets.map(secret => secret?.trim()).filter((secret): secret is string => Boolean(secret)).some(secret => {
        const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
        return received.length === expected.length && timingSafeEqual(received, expected)
    })
}

/** id Reels, под которыми в событии есть комментарий с ключевым словом (не от нашего аккаунта). */
export const keywordMediaIds = (payload: any, account: string | null): string[] => {
    const ids = new Set<string>()
    for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
        for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
            const value = change?.value
            if (change?.field !== 'comments' || !value?.media?.id) continue
            if (account && value.from?.id === account) continue
            if (matchesKeyword(value.text)) ids.add(String(value.media.id))
        }
    }
    return [...ids]
}

/** Кампании этих Reels (только активные) — опросить с ближайшего прохода. Возвращает, сколько отмечено. */
export const markCampaignsDue = async (supabase: any, mediaIds: string[], now: Date): Promise<number> => {
    if (!mediaIds.length) return 0
    const {data, error} = await supabase.from('instagram_campaigns')
        .update({next_poll_at: now.toISOString(), updated_at: now.toISOString()})
        .in('instagram_media_id', mediaIds).eq('status', 'active').select('id')
    if (error) throw error
    return data?.length ?? 0
}

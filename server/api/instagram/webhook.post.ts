import {bot} from '#server/bot/bot'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {instagramAccountId} from '#server/global/engine/instagram/comments/graph'
import {igCommentsMode} from '#server/global/engine/instagram/comments/plan'
import {runInstagramTick} from '#server/global/engine/instagram/comments/tick'
import {keywordMediaIds, markCampaignsDue, signatureValid} from '#server/global/engine/instagram/comments/webhook'

/**
 * События Meta (Instagram → Webhooks, поле comments). Подпись X-Hub-Signature-256 обязательна.
 * Комментарий с «СОХРАНИТЬ» → кампания Reel «пора опросить» → тот же проход, что у таймера
 * /api/bot/instagram/tick, с коротким бюджетом: Meta ждёт ответа недолго и повторяет при ошибке.
 * В лог — только количества, без текста и id людей.
 */
const WEBHOOK_BUDGET_MS = 15_000

export default defineEventHandler(async (event) => {
    const raw = (await readRawBody(event, 'utf8')) ?? ''
    if (!signatureValid(raw, getHeader(event, 'x-hub-signature-256'))) {
        console.warn('[IG WEBHOOK] неверная подпись')
        throw createError({statusCode: 401, statusMessage: 'Unauthorized'})
    }
    let payload: any
    try { payload = JSON.parse(raw) } catch { return 'EVENT_RECEIVED' }

    const changes = (payload?.entry ?? []).flatMap((entry: any) => entry?.changes ?? [])
    const mediaIds = keywordMediaIds(payload, instagramAccountId())
    console.log('[IG WEBHOOK]', JSON.stringify({object: payload?.object, changes: changes.length, fields: [...new Set(changes.map((c: any) => c?.field))], keyword: mediaIds.length}))
    if (!mediaIds.length || igCommentsMode() === 'off') return 'EVENT_RECEIVED'

    try {
        const supabase = getSupabase()
        const now = new Date()
        const marked = await markCampaignsDue(supabase, mediaIds, now)
        const result = await runInstagramTick(supabase, bot.telegram, now, {deadline: Date.now() + WEBHOOK_BUDGET_MS})
        console.log('[IG WEBHOOK] проход', JSON.stringify({marked, poll: (result as any).poll, send: (result as any).send}))
    } catch (error: any) {
        // Ответ Meta всё равно 200: комментарий подберёт таймер, повтор события ничего не добавит.
        console.error('[IG WEBHOOK] проход не удался', error?.message ?? error)
    }
    return 'EVENT_RECEIVED'
})

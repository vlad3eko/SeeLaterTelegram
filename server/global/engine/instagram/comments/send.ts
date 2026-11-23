import {graphFailureText, replyToComment, sendPrivateReply} from '#server/global/engine/instagram/comments/graph'
import {
    alreadySavedDirectText, linkCommentReply, linkDirectText, savedCommentReply, savedDirectText, type IgMediaType
} from '#server/global/engine/instagram/comments/messages'
import {igCommentReplyEnabled, REPLY_WINDOW_MS} from '#server/global/engine/instagram/comments/plan'
import {isChannelMember, saveTitleForUser} from '#server/global/engine/instagram/comments/save'
import {createLeadToken, hashLeadToken, igStartLink, IG_TOKEN_TTL_MS} from '#server/global/engine/instagram/comments/token'
import {NOTIFICATION_MESSAGE, sendNotificationTelegramMessage} from '#server/global/notifications/sendNotificationMessage'

/**
 * Ответы на комментарии из очереди (status queued). Запись захватывается (queued → sending) до
 * запроса к Meta — второй тик её не возьмёт. Исход:
 *   sent — Direct со ссылкой ушёл; auto_saved / already_saved — Instagram уже привязан, сохранили сразу;
 *   queued — лимит Meta, повтор в следующем тике; send_failed — Meta отказала, не повторяем;
 *   send_unknown — таймаут/5xx: сообщение могло уйти, второй раз не шлём.
 */
const MAX_PER_TICK = 20
const MAX_PER_HOUR = 200

type Lead = {id: string, comment_id: string, commenter_id: string | null, commented_at: string, campaign_id: string}
type Campaign = {id: string, media_id: number, media_type: IgMediaType, title: string | null}

const update = (supabase: any, id: string, fields: Record<string, unknown>) =>
    supabase.from('instagram_comment_leads').update({...fields, updated_at: new Date().toISOString()}).eq('id', id)

const publicReply = async (commentId: string, text: string) => {
    if (!igCommentReplyEnabled()) return
    const result = await replyToComment(commentId, text)
    if (!result.ok) console.warn('[IG SEND] ответ под комментарием не опубликован', graphFailureText(result))
}

/** Instagram уже привязан и человек подписан на канал — сохраняем без ссылки. */
const trySaveLinked = async (supabase: any, telegram: any, lead: Lead, campaign: Campaign): Promise<boolean> => {
    if (!lead.commenter_id) return false
    const {data: user} = await supabase.from('users').select('id,telegram_id').eq('instagram_id', lead.commenter_id).maybeSingle()
    if (!user?.telegram_id || !(await isChannelMember(telegram, Number(user.telegram_id)))) return false

    const outcome = await saveTitleForUser(supabase, {userId: user.id, mediaId: campaign.media_id, mediaType: campaign.media_type})
    const direct = await sendPrivateReply(lead.comment_id, outcome === 'saved'
        ? savedDirectText({title: campaign.title, mediaType: campaign.media_type})
        : alreadySavedDirectText({title: campaign.title, mediaType: campaign.media_type}))
    if (!direct.ok) console.warn('[IG SEND] Direct о сохранении не ушёл', graphFailureText(direct))
    await update(supabase, lead.id, {
        status: outcome === 'saved' ? 'auto_saved' : 'already_saved',
        telegram_id: user.telegram_id, sent_at: direct.ok ? new Date().toISOString() : null,
        completed_at: new Date().toISOString(), error_category: direct.ok ? null : direct.kind
    })
    if (direct.ok) await publicReply(lead.comment_id, savedCommentReply())
    if (outcome === 'saved') {
        await sendNotificationTelegramMessage(Number(user.telegram_id), `${NOTIFICATION_MESSAGE.SuccessSaved} из Instagram`, {
            mediaId: campaign.media_id, mediaType: campaign.media_type
        })
    }
    return true
}

export const sendQueued = async (supabase: any, telegram: any, now: Date, {deadline}: {deadline: number}) => {
    const result = {sent: 0, autoSaved: 0, failed: 0, unknown: 0, expired: 0, rateLimited: false}
    // Тик оборвался между захватом и ответом Meta: сообщение могло уйти — не повторяем, отмечаем.
    await supabase.from('instagram_comment_leads').update({status: 'send_unknown', error_category: 'interrupted', updated_at: now.toISOString()})
        .eq('status', 'sending').lt('updated_at', new Date(now.getTime() - 10 * 60_000).toISOString())
    const hourAgo = new Date(now.getTime() - 3600_000).toISOString()
    const {count} = await supabase.from('instagram_comment_leads').select('id', {count: 'exact', head: true}).gte('sent_at', hourAgo)
    const budget = Math.min(MAX_PER_TICK, MAX_PER_HOUR - (count ?? 0))
    if (budget <= 0) return result

    const {data: queue, error} = await supabase.from('instagram_comment_leads')
        .select('id,comment_id,commenter_id,commented_at,campaign_id')
        .eq('status', 'queued').order('created_at', {ascending: true}).limit(budget)
    if (error) throw error
    if (!queue?.length) return result

    const campaignIds = [...new Set((queue as Lead[]).map(lead => lead.campaign_id))]
    const {data: campaigns, error: campaignError} = await supabase.from('instagram_campaigns')
        .select('id,media_id,media_type,title').in('id', campaignIds)
    if (campaignError) throw campaignError
    const campaignById = new Map<string, Campaign>((campaigns ?? []).map((row: Campaign) => [row.id, row]))

    for (const lead of queue as Lead[]) {
        if (Date.now() >= deadline) break
        const campaign = campaignById.get(lead.campaign_id)
        if (!campaign?.media_id) continue
        const {data: claimed} = await supabase.from('instagram_comment_leads')
            .update({status: 'sending', updated_at: new Date().toISOString()})
            .eq('id', lead.id).eq('status', 'queued').select('id')
        if (!claimed?.length) continue

        if (now.getTime() - Date.parse(lead.commented_at) >= REPLY_WINDOW_MS) {
            await update(supabase, lead.id, {status: 'expired'})
            result.expired++
            continue
        }

        try {
            if (await trySaveLinked(supabase, telegram, lead, campaign)) {
                result.autoSaved++
                continue
            }
        } catch (error: any) {
            console.warn('[IG SEND] сохранение по привязке не удалось — отправляем ссылку', error?.message ?? error)
        }

        // Токен — до запроса к Meta: если ответ потеряется, ссылка в дошедшем сообщении всё равно рабочая.
        const token = createLeadToken()
        await update(supabase, lead.id, {token_hash: hashLeadToken(token), token_expires_at: new Date(now.getTime() + IG_TOKEN_TTL_MS).toISOString()})
        const direct = await sendPrivateReply(lead.comment_id, linkDirectText({title: campaign.title, mediaType: campaign.media_type, link: igStartLink(token)}))

        if (direct.ok) {
            await update(supabase, lead.id, {status: 'sent', sent_at: new Date().toISOString(), error_category: null})
            await publicReply(lead.comment_id, linkCommentReply(campaign.media_type))
            result.sent++
        } else if (direct.kind === 'rate') {
            await update(supabase, lead.id, {status: 'queued', token_hash: null, token_expires_at: null, error_category: 'rate'})
            result.rateLimited = true
            console.warn('[IG SEND] лимит Meta — пауза до следующего тика', graphFailureText(direct))
            break
        } else if (direct.kind === 'unknown') {
            await update(supabase, lead.id, {status: 'send_unknown', error_category: 'unknown'})
            result.unknown++
            console.warn('[IG SEND] исход неизвестен, повтора не будет', graphFailureText(direct))
        } else {
            await update(supabase, lead.id, {status: 'send_failed', token_hash: null, token_expires_at: null, error_category: direct.kind})
            result.failed++
            console.warn('[IG SEND] Meta отказала', graphFailureText(direct))
        }
    }
    return result
}

/** Через 30 дней — без Instagram id комментатора и хэша токена (ссылки к тому времени истекли). */
export const forgetOldLeads = async (supabase: any, now: Date) => {
    const before = new Date(now.getTime() - IG_TOKEN_TTL_MS).toISOString()
    await supabase.from('instagram_comment_leads').update({commenter_id: null, token_hash: null})
        .lt('created_at', before).or('commenter_id.not.is.null,token_hash.not.is.null')
}

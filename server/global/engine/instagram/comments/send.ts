import {graphFailureText, replyToComment, sendPrivateReply, type GraphErrorKind} from '#server/global/engine/instagram/comments/graph'
import {
    linkCommentReply, linkDirectText, savedCommentReply, savedDirectText, type IgMediaType
} from '#server/global/engine/instagram/comments/messages'
import {igCommentReplyEnabled, REPLY_WINDOW_MS} from '#server/global/engine/instagram/comments/plan'
import {isChannelMember, saveTitleForUser} from '#server/global/engine/instagram/comments/save'
import {createLeadToken, hashLeadToken, igStartLink, IG_TOKEN_TTL_MS} from '#server/global/engine/instagram/comments/token'
import {NOTIFICATION_MESSAGE, sendNotificationTelegramMessage} from '#server/global/notifications/sendNotificationMessage'
import {moscowDate} from '#server/global/engine/notifications/snapshot'

/**
 * Ответы на комментарии из очереди (status queued). Запись захватывается (queued → sending) до
 * запроса к Meta — второй тик её не возьмёт. Исход:
 *   sent — Direct со ссылкой ушёл; auto_saved / already_saved — Instagram уже привязан, сохранили сразу;
 *   queued — лимит Meta или ошибка токена/прав (общая для всех — запись ждёт, админ получает предупреждение),
 *     повтор в следующем тике; send_failed — Meta отказала по этому комментарию, не повторяем;
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

/** Дата выхода сохранённого тайтла (favorites.release_date, из TMDB) — для обещания напомнить. */
const savedReleaseDate = async (supabase: any, userId: string, campaign: Campaign): Promise<string | null> => {
    const {data} = await supabase.from('favorites').select('release_date')
        .eq('user_id', userId).eq('tmdb_id', campaign.media_id).eq('media_type', campaign.media_type).limit(1).maybeSingle()
    return data?.release_date ? String(data.release_date) : null
}

/** Ошибки, после которых запись возвращается в очередь и проход прерывается: лимит, токен, права. */
const RETRY_KINDS = new Set(['rate', 'token', 'config'])

type LinkedOutcome = {done: true} | {done: false} | {retry: GraphErrorKind, text: string}

/**
 * Instagram уже привязан, человек подписан и не блокировал бота — сохраняем без ссылки на «Старт»: Direct
 * «сохранили» со ссылкой на бота (перейти в Telegram) и ответ под комментарием; напоминание обещаем, только если
 * тайтл ещё не вышел. Ответ под комментарием выключается INSTAGRAM_COMMENT_REPLY=off.
 * Заблокировавшему бота подтверждение в Telegram не дойдёт — ему уходит обычная ссылка: «Старт» снимет блокировку.
 * Лимит или ошибка прав — запись вернётся в очередь; фильм уже сохранён, повтор ответит «уже в коллекции».
 */
const trySaveLinked = async (supabase: any, telegram: any, lead: Lead, campaign: Campaign): Promise<LinkedOutcome> => {
    if (!lead.commenter_id) return {done: false}
    const {data: user} = await supabase.from('users').select('id,telegram_id,bot_blocked_at').eq('instagram_id', lead.commenter_id).maybeSingle()
    if (!user?.telegram_id || user.bot_blocked_at || !(await isChannelMember(telegram, Number(user.telegram_id)))) return {done: false}

    const outcome = await saveTitleForUser(supabase, {userId: user.id, mediaId: campaign.media_id, mediaType: campaign.media_type})
    const text = {
        title: campaign.title, mediaType: campaign.media_type, already: outcome !== 'saved',
        releaseDate: await savedReleaseDate(supabase, user.id, campaign), today: moscowDate(new Date())
    }
    const reply = await sendPrivateReply(lead.comment_id, savedDirectText(text))
    if (!reply.ok && RETRY_KINDS.has(reply.kind)) {
        await update(supabase, lead.id, {status: 'queued', error_category: reply.kind})
        if (outcome === 'saved') await notifySaved(user.telegram_id, campaign)
        return {retry: reply.kind, text: graphFailureText(reply)}
    }
    if (!reply.ok) console.warn('[IG SEND] Direct о сохранении не ушёл', graphFailureText(reply))
    await update(supabase, lead.id, {
        status: outcome === 'saved' ? 'auto_saved' : 'already_saved',
        telegram_id: user.telegram_id, sent_at: reply.ok ? new Date().toISOString() : null,
        completed_at: new Date().toISOString(), error_category: reply.ok ? null : reply.kind
    })
    await publicReply(lead.comment_id, savedCommentReply(text))
    if (outcome === 'saved') await notifySaved(user.telegram_id, campaign)
    return {done: true}
}

const notifySaved = (telegramId: number | string, campaign: Campaign) =>
    sendNotificationTelegramMessage(Number(telegramId), `${NOTIFICATION_MESSAGE.SuccessSaved} из Instagram`, {
        mediaId: campaign.media_id, mediaType: campaign.media_type
    })

export const sendQueued = async (supabase: any, telegram: any, now: Date, {deadline}: {deadline: number}) => {
    const result = {sent: 0, autoSaved: 0, failed: 0, unknown: 0, expired: 0, rateLimited: false, accountError: null as string | null}
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
            const linked = await trySaveLinked(supabase, telegram, lead, campaign)
            if ('retry' in linked) {
                if (linked.retry === 'rate') result.rateLimited = true
                else result.accountError = linked.text
                console.warn('[IG SEND] Direct о сохранении отложен', linked.text)
                break
            }
            if (linked.done) {
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
        } else if (RETRY_KINDS.has(direct.kind)) {
            await update(supabase, lead.id, {status: 'queued', token_hash: null, token_expires_at: null, error_category: direct.kind})
            if (direct.kind === 'rate') result.rateLimited = true
            else result.accountError = graphFailureText(direct)
            console.warn('[IG SEND] пауза до следующего тика', graphFailureText(direct))
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

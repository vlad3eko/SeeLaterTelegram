import {Markup} from 'telegraf'
import {IG_CAMPAIGN, IG_SAVE} from '#server/bot/callbacks/routes'
import {isAdmin} from '#server/bot/consts/admins'
import {mainKeyboard} from '#server/bot/consts/buttons/replyKeyboard'
import {saveTelegramUser} from '#server/bot/handlers/auth/success/saveTelegramUser'
import {subscribeButtons} from '#server/bot/handlers/auth/fail/failedChannelSubscriber'
import {channelLines, missingChannels} from '#server/bot/handlers/channel/requiredChannels'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {decideCampaign} from '#server/global/engine/instagram/comments/campaigns'
import {
    TELEGRAM_EXPIRED_TEXT, TELEGRAM_FOREIGN_TEXT, TELEGRAM_KEPT_TEXT, TELEGRAM_LINKED_ELSEWHERE_TEXT, TELEGRAM_LINKED_TEXT,
    TELEGRAM_NOT_LINKED_TEXT, TELEGRAM_ONE_MORE_TEXT, TELEGRAM_SAVE_FAILED_TEXT, TELEGRAM_SUBSCRIBE_TEXT, TELEGRAM_UNLINKED_TEXT,
    telegramAlreadySavedText, type IgMediaType
} from '#server/global/engine/instagram/comments/messages'
import {linkInstagram, saveTitleForUser, unlinkInstagram, userByTelegramId, type LinkOutcome} from '#server/global/engine/instagram/comments/save'
import {hashLeadToken, parseIgPayload} from '#server/global/engine/instagram/comments/token'
import {isMissingTable} from '#server/global/engine/collections/trailers'
import {NOTIFICATION_MESSAGE, sendNotificationTelegramMessage} from '#server/global/notifications/sendNotificationMessage'
import type {RequiredChannel} from '#server/global/oneLinkApp'

/**
 * Переход из Instagram: `/start ig_<токен>` (ссылка из Direct после комментария «СОХРАНИТЬ»).
 * Токен находит запись комментария → при первом переходе привязываем Instagram к этому Telegram → при
 * подписке на оба обязательных канала сохраняем тайтл штатным путём (favorites + уведомления), иначе
 * просим подписаться (решение владельца 23.11). После подписки тайтл сохраняется сам — по update
 * chat_member или «Проверить подписку» (continueInstagramAfterSubscribe); «Проверить и сохранить» — запасная кнопка.
 */
type LeadRow = {
    id: string
    status: string
    commenter_id: string | null
    telegram_id: number | null
    token_expires_at: string | null
    completed_at: string | null
    campaign: {media_id: number, media_type: IgMediaType, title: string | null} | null
}

const LEAD_FIELDS = 'id,status,commenter_id,telegram_id,token_expires_at,completed_at,campaign:instagram_campaigns(media_id,media_type,title)'
const DONE = new Set(['saved', 'already_saved', 'auto_saved'])
const OPEN = new Set(['sent', 'send_unknown', 'started', ...DONE])
/** Захват сохранения старше этого — оборвавшийся запуск: следующий /start по ссылке его снимает. */
const CLAIM_STALE_MS = 5 * 60_000

/**
 * Захват ждущей записи (started, completed_at пуст): событие подписки и кнопка не сохранят дважды.
 * finishSave ставит итоговый статус; при ошибке захват снимается (releaseLead).
 */
const claimLead = async (supabase: any, leadId: string): Promise<boolean> => {
    const {data, error} = await supabase.from('instagram_comment_leads')
        .update({completed_at: new Date().toISOString(), updated_at: new Date().toISOString()})
        .eq('id', leadId).eq('status', 'started').is('completed_at', null).select('id')
    if (error) throw error
    return Boolean(data?.length)
}

const releaseLead = (supabase: any, leadId: string) =>
    supabase.from('instagram_comment_leads').update({completed_at: null}).eq('id', leadId).eq('status', 'started')

const finishSave = async (telegram: any, telegramId: number, supabase: any, lead: LeadRow) => {
    const campaign = lead.campaign!
    const user = await userByTelegramId(supabase, telegramId)
    if (!user) throw new Error('пользователь не найден после saveTelegramUser')
    const outcome = await saveTitleForUser(supabase, {userId: user.id, mediaId: campaign.media_id, mediaType: campaign.media_type})
    const {error} = await supabase.from('instagram_comment_leads').update({
        status: outcome, completed_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', lead.id)
    if (error) console.warn('[IG START] итог записи не сохранён', error.message)
    if (outcome === 'saved') {
        await sendNotificationTelegramMessage(telegramId, NOTIFICATION_MESSAGE.SuccessSaved, {mediaId: campaign.media_id, mediaType: campaign.media_type})
    } else {
        await telegram.sendMessage(telegramId, telegramAlreadySavedText(campaign.title, campaign.media_type))
    }
    return outcome
}

/** Захват + сохранение; null — запись уже сохраняется (другим путём прямо сейчас) или сохранена. */
const claimAndSave = async (telegram: any, telegramId: number, supabase: any, lead: LeadRow) => {
    if (!(await claimLead(supabase, lead.id))) return null
    try {
        return await finishSave(telegram, telegramId, supabase, lead)
    } catch (error) {
        await releaseLead(supabase, lead.id)
        throw error
    }
}

/** Кнопки каналов без подписки и запасная «Проверить и сохранить» (если событие подписки не дошло). */
const subscribeKeyboard = (leadId: string, missing: readonly RequiredChannel[]) => Markup.inlineKeyboard([
    ...subscribeButtons(missing),
    [Markup.button.callback('Проверить и сохранить', IG_SAVE.encode({leadId}))]
])

const retryKeyboard = (leadId: string) => Markup.inlineKeyboard([[Markup.button.callback('Попробовать ещё раз', IG_SAVE.encode({leadId}))]])

const LINK_TEXT: Partial<Record<LinkOutcome, string>> = {
    linked: TELEGRAM_LINKED_TEXT,
    elsewhere: TELEGRAM_LINKED_ELSEWHERE_TEXT,
    kept: TELEGRAM_KEPT_TEXT
}

/** Сохранить и при ошибке не оставить человека без ответа: «не получилось» с кнопкой повтора. */
const saveOrOfferRetry = async (telegram: any, telegramId: number, supabase: any, lead: LeadRow) => {
    try {
        const outcome = await claimAndSave(telegram, telegramId, supabase, lead)
        if (!outcome) await telegram.sendMessage(telegramId, '⏳ Уже сохраняем — загляните в коллекцию через минуту.')
        return outcome
    } catch (error: any) {
        console.error('[IG START] сохранение не удалось', error?.message ?? error)
        await telegram.sendMessage(telegramId, TELEGRAM_SAVE_FAILED_TEXT(lead.campaign!.title), retryKeyboard(lead.id))
        return null
    }
}

export const startFromInstagram = async (ctx: any, payload: string) => {
    const token = parseIgPayload(payload)
    const supabase = getSupabase() as any
    let lead: LeadRow | null = null
    if (token) {
        const {data, error} = await supabase.from('instagram_comment_leads').select(LEAD_FIELDS).eq('token_hash', hashLeadToken(token)).maybeSingle()
        if (error && !isMissingTable(error)) throw error
        lead = data ?? null
    }
    const expired = !lead || !OPEN.has(lead.status) || !lead.campaign
        || (lead.token_expires_at !== null && Date.parse(lead.token_expires_at) < Date.now())
    if (expired) return ctx.reply(TELEGRAM_EXPIRED_TEXT, mainKeyboard)
    if (lead!.telegram_id && Number(lead!.telegram_id) !== ctx.from.id) return ctx.reply(TELEGRAM_FOREIGN_TEXT, mainKeyboard)

    await saveTelegramUser(ctx)
    const now = new Date().toISOString()
    // Уже started: идущий захват сохранения (completed_at свежий) не трогаем — иначе повторный «Старт» дал бы второе сохранение.
    const staleClaim = lead!.completed_at !== null && Date.parse(lead!.completed_at) < Date.now() - CLAIM_STALE_MS
    const statusFields = DONE.has(lead!.status) ? {}
        : lead!.status === 'started' ? (staleClaim ? {completed_at: null} : {})
            : {status: 'started', started_at: now, completed_at: null}
    const {data: claimed, error: claimError} = await supabase.from('instagram_comment_leads')
        .update({telegram_id: ctx.from.id, updated_at: now, ...statusFields})
        .eq('id', lead!.id).or(`telegram_id.is.null,telegram_id.eq.${ctx.from.id}`).select('id')
    if (claimError) throw claimError
    if (!claimed?.length) return ctx.reply(TELEGRAM_FOREIGN_TEXT, mainKeyboard)

    const linked = await linkInstagram(supabase, {telegramId: ctx.from.id, instagramId: lead!.commenter_id})
    await ctx.reply(LINK_TEXT[linked] ?? 'Открыто главное меню', mainKeyboard)

    const missing = await missingChannels(ctx.telegram, ctx.from.id)
    // saveTelegramUser пишет subscriber: false — ставим настоящее значение, как обычный /start.
    await supabase.from('users').update({subscriber: !missing.length}).eq('telegram_id', ctx.from.id)

    const campaign = lead!.campaign!
    if (DONE.has(lead!.status)) return ctx.reply(telegramAlreadySavedText(campaign.title, campaign.media_type))
    if (missing.length) {
        return ctx.reply(TELEGRAM_SUBSCRIBE_TEXT(campaign.title, channelLines(missing)), subscribeKeyboard(lead!.id, missing))
    }
    await saveOrOfferRetry(ctx.telegram, ctx.from.id, supabase, lead!)
}

/** «Проверить и сохранить» / «Попробовать ещё раз» (запасной путь, если chat_member не дошёл или сохранение упало). */
export const instagramSaveAction = async (ctx: any) => {
    try {
        const {leadId} = IG_SAVE.parse(ctx)
        const supabase = getSupabase() as any
        const {data: lead, error} = await supabase.from('instagram_comment_leads').select(LEAD_FIELDS).eq('id', leadId).maybeSingle() as {data: LeadRow | null, error: any}
        if (error) throw error
        if (!lead?.campaign || Number(lead.telegram_id) !== ctx.from.id) return await ctx.answerCbQuery('Ссылка устарела').catch(() => undefined)
        if (DONE.has(lead.status)) {
            await ctx.editMessageReplyMarkup(undefined).catch(() => undefined)
            return await ctx.answerCbQuery('✅ Уже в вашей коллекции').catch(() => undefined)
        }
        const missing = await missingChannels(ctx.telegram, ctx.from.id)
        if (missing.length) {
            return await ctx.answerCbQuery(`❌ Нет подписки: ${missing.map(channel => channel.title).join(', ')}`).catch(() => undefined)
        }
        const outcome = await claimAndSave(ctx.telegram, ctx.from.id, supabase, lead)
        if (!outcome) return await ctx.answerCbQuery('⏳ Уже сохраняем — загляните в коллекцию через минуту').catch(() => undefined)
        await ctx.editMessageReplyMarkup(undefined).catch(() => undefined)
        await ctx.answerCbQuery(outcome === 'saved' ? NOTIFICATION_MESSAGE.CbQ.SuccessSaved : '✅ Уже в вашей коллекции').catch(() => undefined)
    } catch (error: any) {
        console.error('[IG SAVE] сохранение не удалось', error?.message ?? error)
        await ctx.answerCbQuery('Не получилось сохранить — попробуйте ещё раз через минуту', {show_alert: true}).catch(() => undefined)
    }
}

/**
 * Человек подписался на обязательный канал (update chat_member) или нажал «Проверить подписку»: ждущие
 * подписки переходы из Instagram (status started) сохраняются сами; если остался второй канал — напоминаем о нём.
 * true — человеку действительно написали (общий обработчик подписки тогда молчит).
 */
export const continueInstagramAfterSubscribe = async (telegram: any, telegramId: number, missing: readonly RequiredChannel[]): Promise<boolean> => {
    const supabase = getSupabase() as any
    const {data, error} = await supabase.from('instagram_comment_leads').select(LEAD_FIELDS)
        .eq('telegram_id', telegramId).eq('status', 'started').is('completed_at', null)
        .order('started_at', {ascending: false}).limit(5)
    if (error) {
        if (!isMissingTable(error)) console.warn('[IG SUBSCRIBE]', error.message)
        return false
    }
    const leads = ((data ?? []) as LeadRow[]).filter(lead => lead.campaign)
    if (!leads.length) return false
    try {
        if (missing.length) {
            await telegram.sendMessage(telegramId, TELEGRAM_ONE_MORE_TEXT(channelLines(missing)), subscribeKeyboard(leads[0]!.id, missing))
            return true
        }
        let told = false
        for (const lead of leads) {
            await saveOrOfferRetry(telegram, telegramId, supabase, lead)
            told = true
        }
        return told
    } catch (error: any) {
        console.warn('[IG SUBSCRIBE] сообщение не отправлено', error?.response?.description ?? error?.message ?? error)
        return false
    }
}

/** /instagram_off — отвязать Instagram: автосохранение из комментариев больше не идёт в этот Telegram. */
export const instagramOffCommand = async (ctx: any) => {
    try {
        const unlinked = await unlinkInstagram(getSupabase(), ctx.from.id)
        await ctx.reply(unlinked ? TELEGRAM_UNLINKED_TEXT : TELEGRAM_NOT_LINKED_TEXT)
    } catch (error: any) {
        console.error('[IG OFF]', error?.message ?? error)
        await ctx.reply('Не получилось отвязать Instagram — попробуйте позже.').catch(() => undefined)
    }
}

/** Кнопки администратора под «Новый Reel в Instagram». */
export const instagramCampaignAction = async (ctx: any) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery().catch(() => undefined)
    const {campaignId, choice} = IG_CAMPAIGN.parse(ctx)
    const decided = await decideCampaign(getSupabase(), campaignId, choice)
    if (!decided) return ctx.answerCbQuery('Кампания не найдена').catch(() => undefined)
    await ctx.editMessageText(decided.text, {link_preview_options: {is_disabled: true}}).catch(() => undefined)
    await ctx.answerCbQuery().catch(() => undefined)
}

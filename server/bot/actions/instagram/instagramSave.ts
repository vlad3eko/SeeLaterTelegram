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
    TELEGRAM_EXPIRED_TEXT, TELEGRAM_FOREIGN_TEXT, TELEGRAM_LINKED_TEXT, TELEGRAM_ONE_MORE_TEXT, TELEGRAM_SUBSCRIBE_TEXT, shortTitle
} from '#server/global/engine/instagram/comments/messages'
import {linkInstagram, saveTitleForUser, userByTelegramId} from '#server/global/engine/instagram/comments/save'
import {hashLeadToken, parseIgPayload} from '#server/global/engine/instagram/comments/token'
import {isMissingTable} from '#server/global/engine/collections/trailers'
import {NOTIFICATION_MESSAGE, sendNotificationTelegramMessage} from '#server/global/notifications/sendNotificationMessage'
import type {RequiredChannel} from '#server/global/oneLinkApp'

/**
 * Переход из Instagram: `/start ig_<токен>` (ссылка из Direct после комментария «СОХРАНИТЬ»).
 * Токен находит запись комментария → привязываем Instagram к этому Telegram → при подписке на оба
 * обязательных канала сохраняем фильм штатным путём (favorites + уведомления), иначе просим
 * подписаться (решение владельца 23.11). После подписки фильм сохраняется сам — по update
 * chat_member (continueInstagramAfterSubscribe); «Проверить и сохранить» — запасная кнопка.
 */
type LeadRow = {
    id: string
    status: string
    commenter_id: string | null
    telegram_id: number | null
    token_expires_at: string | null
    campaign: {media_id: number, media_type: 'movie' | 'tv', title: string | null} | null
}

const LEAD_FIELDS = 'id,status,commenter_id,telegram_id,token_expires_at,campaign:instagram_campaigns(media_id,media_type,title)'
const DONE = new Set(['saved', 'already_saved', 'auto_saved'])
const OPEN = new Set(['sent', 'send_unknown', 'started', ...DONE])

/**
 * Захват ждущей записи (started, completed_at пуст): событие подписки и кнопка не сохранят дважды.
 * finishSave ставит итоговый статус; при ошибке захват снимается (releaseLead).
 */
const claimLead = async (supabase: any, leadId: string): Promise<boolean> => {
    const {data} = await supabase.from('instagram_comment_leads')
        .update({completed_at: new Date().toISOString(), updated_at: new Date().toISOString()})
        .eq('id', leadId).eq('status', 'started').is('completed_at', null).select('id')
    return Boolean(data?.length)
}

const releaseLead = (supabase: any, leadId: string) =>
    supabase.from('instagram_comment_leads').update({completed_at: null}).eq('id', leadId).eq('status', 'started')

const finishSave = async (telegram: any, telegramId: number, supabase: any, lead: LeadRow) => {
    const campaign = lead.campaign!
    const user = await userByTelegramId(supabase, telegramId)
    if (!user) throw new Error('пользователь не найден после saveTelegramUser')
    const outcome = await saveTitleForUser(supabase, {userId: user.id, mediaId: campaign.media_id, mediaType: campaign.media_type})
    await supabase.from('instagram_comment_leads').update({
        status: outcome, completed_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', lead.id)
    if (outcome === 'saved') {
        await sendNotificationTelegramMessage(telegramId, NOTIFICATION_MESSAGE.SuccessSaved, {mediaId: campaign.media_id, mediaType: campaign.media_type})
    } else {
        await telegram.sendMessage(telegramId, `«${shortTitle(campaign.title)}» уже есть в вашей коллекции — напомним, когда выйдет.`)
    }
    return outcome
}

/** Захват + сохранение; null — запись уже сохраняется или сохранена другим путём. */
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
    const {data: claimed} = await supabase.from('instagram_comment_leads')
        .update({
            telegram_id: ctx.from.id, updated_at: new Date().toISOString(),
            ...(DONE.has(lead!.status) ? {} : {status: 'started', started_at: new Date().toISOString(), completed_at: null})
        })
        .eq('id', lead!.id).or(`telegram_id.is.null,telegram_id.eq.${ctx.from.id}`).select('id')
    if (!claimed?.length) return ctx.reply(TELEGRAM_FOREIGN_TEXT, mainKeyboard)

    const linked = await linkInstagram(supabase, {telegramId: ctx.from.id, instagramId: lead!.commenter_id})
    await ctx.reply(linked ? TELEGRAM_LINKED_TEXT : 'Открыто главное меню', mainKeyboard)

    if (DONE.has(lead!.status)) return ctx.reply(`«${shortTitle(lead!.campaign!.title)}» уже в вашей коллекции.`)
    const missing = await missingChannels(ctx.telegram, ctx.from.id)
    if (missing.length) {
        return ctx.reply(TELEGRAM_SUBSCRIBE_TEXT(lead!.campaign!.title, channelLines(missing)), subscribeKeyboard(lead!.id, missing))
    }
    await claimAndSave(ctx.telegram, ctx.from.id, supabase, lead!)
}

/** «Проверить и сохранить» под просьбой подписаться (запасной путь, если chat_member не дошёл). */
export const instagramSaveAction = async (ctx: any) => {
    const {leadId} = IG_SAVE.parse(ctx)
    const supabase = getSupabase() as any
    const {data: lead} = await supabase.from('instagram_comment_leads').select(LEAD_FIELDS).eq('id', leadId).maybeSingle() as {data: LeadRow | null}
    if (!lead?.campaign || Number(lead.telegram_id) !== ctx.from.id) return ctx.answerCbQuery('Ссылка устарела').catch(() => undefined)
    if (DONE.has(lead.status)) {
        await ctx.editMessageReplyMarkup(undefined).catch(() => undefined)
        return ctx.answerCbQuery('✅ Уже в вашей коллекции').catch(() => undefined)
    }
    const missing = await missingChannels(ctx.telegram, ctx.from.id)
    if (missing.length) {
        return ctx.answerCbQuery(`❌ Нет подписки: ${missing.map(channel => channel.title).join(', ')}`).catch(() => undefined)
    }
    const outcome = await claimAndSave(ctx.telegram, ctx.from.id, supabase, lead)
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined)
    await ctx.answerCbQuery(outcome === 'saved' ? NOTIFICATION_MESSAGE.CbQ.SuccessSaved : '✅ Уже в вашей коллекции').catch(() => undefined)
}

/**
 * Человек подписался на обязательный канал (update chat_member): ждущие подписки переходы из
 * Instagram (status started) сохраняются сами; если остался второй канал — напоминаем о нём.
 * true — человеку уже написали (общий обработчик подписки молчит).
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
    if (missing.length) {
        await telegram.sendMessage(telegramId, TELEGRAM_ONE_MORE_TEXT(channelLines(missing)), subscribeKeyboard(leads[0]!.id, missing))
        return true
    }
    for (const lead of leads) {
        await claimAndSave(telegram, telegramId, supabase, lead)
            .catch(error => console.error('[IG SUBSCRIBE] сохранение не удалось', error?.message ?? error))
    }
    return true
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

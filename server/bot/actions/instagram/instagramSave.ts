import {Markup} from 'telegraf'
import {IG_CAMPAIGN, IG_SAVE} from '#server/bot/callbacks/routes'
import {isAdmin} from '#server/bot/consts/admins'
import {mainKeyboard} from '#server/bot/consts/buttons/replyKeyboard'
import {saveTelegramUser} from '#server/bot/handlers/auth/success/saveTelegramUser'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {decideCampaign} from '#server/global/engine/instagram/comments/campaigns'
import {
    TELEGRAM_EXPIRED_TEXT, TELEGRAM_FOREIGN_TEXT, TELEGRAM_LINKED_TEXT, TELEGRAM_SUBSCRIBE_TEXT, shortTitle
} from '#server/global/engine/instagram/comments/messages'
import {isChannelMember, linkInstagram, saveTitleForUser, userByTelegramId} from '#server/global/engine/instagram/comments/save'
import {hashLeadToken, parseIgPayload} from '#server/global/engine/instagram/comments/token'
import {isMissingTable} from '#server/global/engine/collections/trailers'
import {NOTIFICATION_MESSAGE, sendNotificationTelegramMessage} from '#server/global/notifications/sendNotificationMessage'
import {telegramChannelShortLink} from '#server/global/oneLinkApp'

/**
 * Переход из Instagram: `/start ig_<токен>` (ссылка из Direct после комментария «СОХРАНИТЬ»).
 * Токен находит запись комментария → привязываем Instagram к этому Telegram → при подписке на канал
 * сохраняем фильм штатным путём (favorites + уведомления), иначе просим подписаться (решение
 * владельца 23.11: сохранение только с подпиской) и сохраняем по кнопке «Проверить и сохранить».
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

const finishSave = async (ctx: any, supabase: any, lead: LeadRow) => {
    const campaign = lead.campaign!
    const user = await userByTelegramId(supabase, ctx.from.id)
    if (!user) throw new Error('пользователь не найден после saveTelegramUser')
    const outcome = await saveTitleForUser(supabase, {userId: user.id, mediaId: campaign.media_id, mediaType: campaign.media_type})
    await supabase.from('instagram_comment_leads').update({
        status: outcome, completed_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', lead.id)
    if (outcome === 'saved') {
        await sendNotificationTelegramMessage(ctx.from.id, NOTIFICATION_MESSAGE.SuccessSaved, {mediaId: campaign.media_id, mediaType: campaign.media_type})
    } else {
        await ctx.reply(`«${shortTitle(campaign.title)}» уже есть в вашей коллекции — напомним, когда выйдет.`)
    }
    return outcome
}

const subscribeKeyboard = (leadId: string) => Markup.inlineKeyboard([
    [Markup.button.url('Подписаться на канал', telegramChannelShortLink)],
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
            ...(DONE.has(lead!.status) ? {} : {status: 'started', started_at: new Date().toISOString()})
        })
        .eq('id', lead!.id).or(`telegram_id.is.null,telegram_id.eq.${ctx.from.id}`).select('id')
    if (!claimed?.length) return ctx.reply(TELEGRAM_FOREIGN_TEXT, mainKeyboard)

    const linked = await linkInstagram(supabase, {telegramId: ctx.from.id, instagramId: lead!.commenter_id})
    await ctx.reply(linked ? TELEGRAM_LINKED_TEXT : 'Открыто главное меню', mainKeyboard)

    if (DONE.has(lead!.status)) return ctx.reply(`«${shortTitle(lead!.campaign!.title)}» уже в вашей коллекции.`)
    if (!(await isChannelMember(ctx.telegram, ctx.from.id))) {
        return ctx.reply(TELEGRAM_SUBSCRIBE_TEXT(lead!.campaign!.title), subscribeKeyboard(lead!.id))
    }
    await finishSave(ctx, supabase, lead!)
}

/** «Проверить и сохранить» под просьбой подписаться. */
export const instagramSaveAction = async (ctx: any) => {
    const {leadId} = IG_SAVE.parse(ctx)
    const supabase = getSupabase() as any
    const {data: lead} = await supabase.from('instagram_comment_leads').select(LEAD_FIELDS).eq('id', leadId).maybeSingle() as {data: LeadRow | null}
    if (!lead?.campaign || Number(lead.telegram_id) !== ctx.from.id) return ctx.answerCbQuery('Ссылка устарела').catch(() => undefined)
    if (DONE.has(lead.status)) {
        await ctx.editMessageReplyMarkup(undefined).catch(() => undefined)
        return ctx.answerCbQuery('✅ Уже в вашей коллекции').catch(() => undefined)
    }
    if (!(await isChannelMember(ctx.telegram, ctx.from.id))) return ctx.answerCbQuery('❌ Подписка на канал не найдена').catch(() => undefined)
    const outcome = await finishSave(ctx, supabase, lead)
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined)
    await ctx.answerCbQuery(outcome === 'saved' ? NOTIFICATION_MESSAGE.CbQ.SuccessSaved : '✅ Уже в вашей коллекции').catch(() => undefined)
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

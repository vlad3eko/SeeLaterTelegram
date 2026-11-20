import {Markup} from 'telegraf'
import {NOTIFY_BACK, NOTIFY_CARD, NOTIFY_MORE} from '#server/bot/callbacks/routes'
import {isAdmin} from '#server/bot/consts/admins'
import {normalizeRichContext} from '#server/global/engine/card/construct/normalizeRichContext'
import {tryGenerateCard} from '#server/global/engine/card/construct/tryGenerateCard'
import {engineRichCard} from '#server/global/engine/card/engineRichCard'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {digestKeyboard, type DigestPayload} from '#server/global/engine/notifications/digest'

/**
 * Сводка обновлений коллекции (решение владельца 21.11): «🎬 Название» открывает карточку в этом же
 * сообщении, под карточкой «◀️ К сводке» возвращает сводку (готовое сообщение — в digest_deliveries).
 */

const targetOf = (ctx: any) => {
    const target = normalizeRichContext(ctx)
    return target ? {...target, isAdmin: isAdmin(ctx.from?.id)} : undefined
}

const backButton = (deliveryId: number) => ({
    ...Markup.button.callback('◀️ К сводке', NOTIFY_BACK.encode({deliveryId})),
    style: 'danger'
})

export const notifyCardAction = async (ctx: any) => {
    const {deliveryId, ...card} = NOTIFY_CARD.parse(ctx)
    await ctx.answerCbQuery().catch(() => undefined)
    try {
        // «🔗 Похожее» уводит в другой список без пути назад к сводке — в этой карточке его нет.
        await engineRichCard(targetOf(ctx), {id: card.mediaId, type: card.mediaType, status: 'ready', contentType: card.contentType}, {
            hideSimilar: true,
            footerRows: [[backButton(deliveryId)]]
        })
    } catch (error) {
        console.error('[NOTIFY] Card failed', error)
        await ctx.telegram.sendMessage(ctx.from.id, '⚠️ Не удалось загрузить карточку — попробуйте ещё раз.').catch(() => undefined)
    }
}

/** Сводка этого пользователя; чужую или удалённую не отдаём (ответ на нажатие уже дан). */
const ownDigest = async (ctx: any, deliveryId: number): Promise<DigestPayload | undefined> => {
    const supabase = getSupabase()
    const {data: delivery} = await supabase.from('digest_deliveries').select('user_id,payload').eq('id', deliveryId).maybeSingle()
    const {data: user} = await supabase.from('users').select('id').eq('telegram_id', ctx.from?.id).maybeSingle()
    if (!delivery || !user || Number(delivery.user_id) !== Number(user.id)) {
        await ctx.answerCbQuery('Сводка больше недоступна.').catch(() => undefined)
        return undefined
    }
    await ctx.answerCbQuery().catch(() => undefined)
    return delivery.payload as DigestPayload
}

/** «▼ Ещё» / «▲ Свернуть»: меняются только кнопки, сообщение остаётся. */
export const notifyMoreAction = async (ctx: any) => {
    const {deliveryId, open} = NOTIFY_MORE.parse(ctx)
    try {
        const payload = await ownDigest(ctx, deliveryId)
        if (!payload) return
        await ctx.editMessageReplyMarkup(digestKeyboard(payload.cards, deliveryId, open))
    } catch (error: any) {
        if (String(error?.message).includes('message is not modified')) return
        console.error('[NOTIFY] More buttons failed', error)
        await ctx.answerCbQuery().catch(() => undefined)
    }
}

export const notifyBackAction = async (ctx: any) => {
    const {deliveryId} = NOTIFY_BACK.parse(ctx)
    try {
        const payload = await ownDigest(ctx, deliveryId)
        if (!payload) return
        await tryGenerateCard(targetOf(ctx), payload.rich, digestKeyboard(payload.cards, deliveryId))
    } catch (error) {
        console.error('[NOTIFY] Back to digest failed', error)
        await ctx.answerCbQuery().catch(() => undefined)
        await ctx.telegram.sendMessage(ctx.from.id, '⚠️ Не удалось вернуть сводку — попробуйте ещё раз.').catch(() => undefined)
    }
}

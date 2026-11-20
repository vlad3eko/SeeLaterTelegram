import {Markup} from 'telegraf'
import {NOTIFY_BACK, NOTIFY_CARD} from '#server/bot/callbacks/routes'
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

export const notifyBackAction = async (ctx: any) => {
    const {deliveryId} = NOTIFY_BACK.parse(ctx)
    try {
        const supabase = getSupabase()
        const {data: delivery} = await supabase.from('digest_deliveries').select('user_id,payload').eq('id', deliveryId).maybeSingle()
        const {data: user} = await supabase.from('users').select('id').eq('telegram_id', ctx.from?.id).maybeSingle()
        // Чужую сводку не показываем.
        if (!delivery || !user || Number(delivery.user_id) !== Number(user.id)) {
            await ctx.answerCbQuery('Сводка больше недоступна.').catch(() => undefined)
            return
        }
        await ctx.answerCbQuery().catch(() => undefined)
        const payload = delivery.payload as DigestPayload
        await tryGenerateCard(targetOf(ctx), payload.rich, digestKeyboard(payload.cards, deliveryId))
    } catch (error) {
        console.error('[NOTIFY] Back to digest failed', error)
        await ctx.answerCbQuery().catch(() => undefined)
        await ctx.telegram.sendMessage(ctx.from.id, '⚠️ Не удалось вернуть сводку — попробуйте ещё раз.').catch(() => undefined)
    }
}

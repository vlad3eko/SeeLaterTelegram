import {NOTIFY_CARD} from '#server/bot/callbacks/routes'
import {isAdmin} from '#server/bot/consts/admins'
import {constructRichCard} from '#server/global/engine/card/construct/constructRichCard'
import {sendRichMessage} from '#server/global/engine/card/transport/sendRichMessage'

/**
 * «🎬 Название» в сводке обновлений коллекции: карточка тайтла НОВЫМ сообщением — сводку не
 * правим, в ней могут быть и другие новости.
 */
export const notifyCardAction = async (ctx: any) => {
    const card = NOTIFY_CARD.parse(ctx)
    await ctx.answerCbQuery().catch(() => undefined)
    try {
        const target = {ctx, chatId: ctx.chat?.id ?? ctx.from?.id, isAdmin: isAdmin(ctx.from?.id)}
        const {caption, keyboard} = await constructRichCard(target as any, {
            id: card.mediaId,
            type: card.mediaType,
            status: 'ready',
            contentType: card.contentType
        })
        await sendRichMessage(ctx, caption, keyboard)
    } catch (error) {
        console.error('[NOTIFY] Card failed', error)
        await ctx.telegram.sendMessage(ctx.from.id, '⚠️ Не удалось загрузить карточку — попробуйте ещё раз.').catch(() => undefined)
    }
}

import {Markup} from 'telegraf'
import {SIMILAR_CARD, SIMILAR_LIST, type SimilarRef} from '#server/bot/callbacks/routes'
import {isAdmin} from '#server/bot/consts/admins'
import {buildSimilarFor} from '#server/global/engine/collections/similar'
import {constructRichListCard} from '#server/global/engine/card/construct/constructRichListCard'
import {normalizeRichContext} from '#server/global/engine/card/construct/normalizeRichContext'
import {tryGenerateCard} from '#server/global/engine/card/construct/tryGenerateCard'
import {engineRichCard} from '#server/global/engine/card/engineRichCard'
import {sendRichMessage} from '#server/global/engine/card/transport/sendRichMessage'
import type {ContentType} from '#server/global/engine/search/strategy/enums'

/**
 * «🔗 Похожее» на карточке фильма или сериала — для всех пользователей, вне подборок /g.
 *
 * Нажатие превращает это же сообщение в список 10 похожих тайтлов с трейлерами (тот же подбор,
 * что «Похожее» в /g: рекомендации зрителей TMDB, общие темы, та же полка, без своей франшизы).
 * Номер открывает карточку тайтла с «◀️ К похожим», в списке — «◀️ К карточке». Состояния в базе
 * нет: всё нужное лежит в данных кнопок. Из канала кнопка ведёт в бота (/start similar_…) —
 * там список приходит новым сообщением.
 */

const button = (text: string, data: string, style?: 'success' | 'danger') => ({
    ...Markup.button.callback(text, data),
    ...(style ? {style} : {})
})

const targetOf = (ctx: any) => {
    const target = normalizeRichContext(ctx)
    return target ? {...target, isAdmin: isAdmin(ctx.from?.id)} : undefined
}

/** Повторное нажатие, пока список собирается (до 10 секунд), не запускает вторую сборку. */
const busy = new Set<string>()

/** Список похожих в нажатом сообщении (или новым сообщением, если править нечего). */
export const showSimilarList = async (ctx: any, base: SimilarRef) => {
    const target = targetOf(ctx)
    if (!target) return

    const {shelf, items, title} = await buildSimilarFor({mediaType: base.mediaType, id: base.mediaId})
    if (!items.length) {
        await ctx.telegram.sendMessage(ctx.from.id, '😕 Похожих с трейлером не нашлось.').catch(() => undefined)
        return
    }

    const refs: SimilarRef[] = items.map(item => ({mediaType: item.mediaType, mediaId: item.id, contentType: shelf.contentType as ContentType}))
    const {caption, keyboard} = await constructRichListCard(target, items.map((item, index) => ({
        id: item.id,
        type: item.mediaType,
        status: 'ready' as const,
        contentType: refs[index]!.contentType,
        keyTrailer: item.trailer.key
    })), {
        title: `🔗 Похоже на «${title}»`,
        itemButton: (text, index) => button(text, SIMILAR_CARD.encode({...refs[index]!, from: base}), 'success'),
        numbersPerRow: 5,
        footerRows: [[button('◀️ К карточке', SIMILAR_CARD.encode(base), 'danger')]]
    })
    caption.blocks.splice(1, 0, {
        type: 'paragraph',
        text: [{type: 'italic', text: 'Рекомендации зрителей TMDB и общие темы, без своей франшизы. Нажмите номер — покажу карточку.'}]
    })

    // Править — только нажатое сообщение; из /start similar_… (ссылка из канала) — новым сообщением,
    // иначе целью стало бы сообщение пользователя «/start», а его бот править не может.
    if (ctx.callbackQuery) await tryGenerateCard(target, caption, keyboard)
    else await sendRichMessage(ctx, caption, keyboard)
}

/** «🔗 Похожее» на карточке и «◀️ К похожим» на карточке из списка. */
export const similarListAction = async (ctx: any) => {
    const base = SIMILAR_LIST.parse(ctx)
    const key = `${ctx.from?.id}:${ctx.callbackQuery?.data}`
    if (busy.has(key)) {
        await ctx.answerCbQuery('Уже ищу — подождите пару секунд.').catch(() => undefined)
        return
    }
    busy.add(key)
    try {
        await ctx.answerCbQuery('Ищу похожее…').catch(() => undefined)
        await showSimilarList(ctx, base)
    } catch (error) {
        console.error('[SIMILAR] List failed', error)
        await ctx.telegram.sendMessage(ctx.from.id, '😕 Не получилось найти похожее — попробуйте ещё раз.').catch(() => undefined)
    } finally {
        busy.delete(key)
    }
}

/** Номер в списке → карточка тайтла; «◀️ К карточке» → карточка, с которой начали. */
export const similarCardAction = async (ctx: any) => {
    const {from, ...card} = SIMILAR_CARD.parse(ctx)
    await ctx.answerCbQuery().catch(() => undefined)
    try {
        await engineRichCard(targetOf(ctx), {id: card.mediaId, type: card.mediaType, status: 'ready', contentType: card.contentType}, {
            footerRows: from ? [[button('◀️ К похожим', SIMILAR_LIST.encode(from), 'danger')]] : []
        })
    } catch (error) {
        console.error('[SIMILAR] Card failed', error)
        await ctx.telegram.sendMessage(ctx.from.id, '⚠️ Не удалось загрузить карточку — попробуйте ещё раз.').catch(() => undefined)
    }
}

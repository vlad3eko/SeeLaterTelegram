import type {queryCTX, queryRichCard} from "#server/global/engine/card/enum/types"
import {resolveRichItem} from "#server/global/engine/card/resolve/resolveRichItem"
import {createRichListCaption} from "#server/global/engine/card/variant/createRichListCaption"
import {createRichListKeyboard} from "#server/global/engine/card/construct/createRichListKeyboard"

export type RichListOptions = {
    /** Заголовок над списком (подборки /g). */
    title?: string
    /** Мелкий текст под заголовком (настройки подборки). */
    subtitle?: string
    /** Мелкий текст в самом низу (номер страницы). */
    footer?: string
    /** Нижние ряды кнопок вместо «Назад» старого /g. */
    footerRows?: any[][]
    /** Дата у сериалов: первая серия или последняя вышедшая. */
    tvDate?: 'first' | 'last'
    /** Своя кнопка строки (подборки /g: открыть тайтл с возвратом к подборке). */
    itemButton?: (text: string, index: number) => any
}

export const constructRichListCard = async (
    ctx: queryCTX | undefined,
    queries: queryRichCard[],
    options: RichListOptions = {}
) => {

    const items =
        await Promise.all(queries
                .map(query => resolveRichItem(ctx, query, 'list')))

    const caption = createRichListCaption(items, {tvDate: options.tvDate})

    if (options.subtitle) caption.blocks.unshift({type: 'footer', text: options.subtitle})
    if (options.title) {
        caption.blocks.unshift({
            type: 'heading',
            size: 1,
            text: [options.title]
        })
    }
    if (options.footer) caption.blocks.push({type: 'footer', text: options.footer})

    return {
        items,
        caption,
        keyboard: createRichListKeyboard(items, options.footerRows, options.itemButton)
    }
}

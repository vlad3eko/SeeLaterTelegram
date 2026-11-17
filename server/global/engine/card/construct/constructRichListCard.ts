import type {queryCTX, queryRichCard} from "#server/global/engine/card/enum/types"
import {resolveRichItem} from "#server/global/engine/card/resolve/resolveRichItem"
import {createRichListCaption} from "#server/global/engine/card/variant/createRichListCaption"
import {createRichListKeyboard} from "#server/global/engine/card/construct/createRichListKeyboard"

export type RichListOptions = {
    /** Заголовок над списком (подборки /g). */
    title?: string
    /** Нижние ряды кнопок вместо «Назад» старого /g. */
    footerRows?: any[][]
    /** Дата у сериалов: первая серия или последняя вышедшая. */
    tvDate?: 'first' | 'last'
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

    if (options.title) {
        caption.blocks.unshift({
            type: 'heading',
            size: 1,
            text: [options.title]
        })
    }

    return {
        items,
        caption,
        keyboard: createRichListKeyboard(items, options.footerRows)
    }
}

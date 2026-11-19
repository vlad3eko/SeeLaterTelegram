import {Markup} from "telegraf"
import {backButton, contentListCardButton} from "#server/bot/consts/buttons/admin/contentEngine/buttonsRepository";

const getTitle = (
    item: any
) => {

    const media =
        item.data.media

    return (
        media.title ||
        media.name ||
        media.original_title ||
        media.original_name ||
        'Без названия'
    )
}

const truncate = (text: string, maxLength: number) =>
    text.length > maxLength
        ? text.slice(0, maxLength - 1) + '…'
        : text

export const createRichListKeyboard = (
    items: any[],
    footerRows?: any[][],
    itemButton?: (text: string, index: number) => any,
    startNumber = 1,
    numbersPerRow?: number
) => {

    // Подборки /g: на кнопках только номера («1», «2»…), по numbersPerRow в ряд — названия есть в списке.
    const rows: any[][] = numbersPerRow ? [] : items
        .map((item: any, index: number) => {
                const title = truncate(getTitle(item), 34)
                const number = startNumber + index

                return [
                    itemButton
                        ? itemButton(`${number}. ${title}`, index)
                        : contentListCardButton(`${number}. ${title}`, item.query),
                ]
            }
        )
    if (numbersPerRow) {
        const buttons = items.map((item: any, index: number) => {
            const text = String(startNumber + index)
            return itemButton ? itemButton(text, index) : contentListCardButton(text, item.query)
        })
        for (let i = 0; i < buttons.length; i += numbersPerRow) rows.push(buttons.slice(i, i + numbersPerRow))
    }

    if (footerRows?.length) {
        rows.push(...footerRows)
    } else {
        rows.push([
            backButton()
        ])
    }

    return Markup.inlineKeyboard(rows).reply_markup
}

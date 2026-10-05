import {Markup} from "telegraf"
import {ContentTelegramMenu} from "~/utils/engines/content/strategy/enums";
import {backButton} from "#server/bot/consts/buttons/admin/contentEngine/buttonsRepository";

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

export const createRichListKeyboard = (items: any[]) => {

    const rows = items
        .map((item: any, index: number) => {
                const title = truncate(getTitle(item), 34)

                return [
                    Markup.button.callback(
                        `${index + 1}. ${title}`,
                        `bot:${item.query.type}:${item.query.contentType}:${item.query.id}`
                    ),
                ]
            }
        )

    rows.push([
        backButton()
    ])

    return Markup.inlineKeyboard(rows).reply_markup
}

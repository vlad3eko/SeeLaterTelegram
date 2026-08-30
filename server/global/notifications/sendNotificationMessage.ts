import {bot} from "#server/bot/bot";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageNotificationType} from "#server/bot/consts/types/SessionMessageTypes";
import {tmdbFetch} from "#server/utils/api/tmdbFetch";
import {linkOfMedia} from "#server/global/helpers/linkOfMedia";
import {Markup} from "telegraf";
import {checkBookmarksMedias} from "#server/bot/consts/buttons/buttonsBot";
import {telegramBotShortLink, telegramChannelShortLink} from "#server/global/oneLinkApp";

export interface TextMessage {
    message_id: number
    from?: {
        id: number
        is_bot: boolean
        first_name: string
        username?: string
    }
    chat: {
        id: number
        first_name: string
        username?: string
        type: string
    }
    date: number
    text: string
}

export const NOTIFICATION_MESSAGE = {
    SuccessSaved: 'успешно добавлено в вашу коллекцию',

    ContactUs: 'Спасибо, мы активно развиваемся благодаря вашей поддержке.\n\n<a href="https://t.me/kinomanovnet?direct"><b>Вопросы и предложения</b></a>',

    CbQ: {
        SuccessSaved: '✅ Добавлено в вашу коллекцию',
        ErrorOnlyForSubscriber: '❌ Подпишитесь на 🏷Киноманов BOT',
        ErrorAlreadyExist: '❌ Уже сохраняли',
        SuccessDelete: '✅ Удалено из вашей коллекции',
        ErrorDoesNotExist: '❌ Нечего удалять',
    }
} as const

export const SHARE_CHANNEL_LINKS = {
    Group: `
🤖 <a href="${telegramBotShortLink}">Киноманов BOT | Ищи и Сохраняй</a>
📢 <a href="${telegramChannelShortLink}">Киноманов NET | Фильмы и сериалы</a>

${NOTIFICATION_MESSAGE.ContactUs}
    `
}

interface NOTIFICATION_OPTIONS {
    mediaId: number
    mediaType: string
}

export const sendNotificationTelegramMessage = async (userId: number, description: string, {mediaId, mediaType}: NOTIFICATION_OPTIONS) => {
    try {

        const options = {mediaId, mediaType}

        const media = await tmdbFetch(
            '/api/tmdb/media',
            {
                query: {
                    id: options.mediaId,
                    media: options.mediaType
                }
            }
        )

        const savedInfo = `<b>${linkOfMedia(media.name || media.title)}</b>: ` || ''
        const message = await bot.telegram.sendMessage(userId, `${savedInfo}${description}\n\n${NOTIFICATION_MESSAGE.ContactUs}`, {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
                checkBookmarksMedias()
            ]).reply_markup
        }) as TextMessage

        await addMessageSession(
            message.chat.id,
            SessionMessageNotificationType.Saved, {
                messageId: message.message_id
            }
        )
    } catch (e) {
        console.log('ошибка отправка', e)
    }
}

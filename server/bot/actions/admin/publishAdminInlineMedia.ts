import {
    clearAdminEditSession,
    getAdminEditSession
} from "#server/bot/actions/admin/adminEditSession";

import {
    keyboardSendMediaCardInline
} from "#server/bot/consts/buttons/keyboardBot";

import {
    CURRENT_KEYBOARD_VERSION
} from "#server/bot/consts/keyboardVersion/keyboardVersion";


export const publishAdminInlineMedia = async (ctx: any) => {

    const session =
        getAdminEditSession(
            ctx.from.id
        )


    if (!session) {

        await ctx.answerCbQuery(
            'Сессия редактирования не найдена'
        )

        return
    }


    const channelId =
        '@kinomanovnet'


    const {
        type,
        fileId
    } =
        session.currentMedia


    const channelReplyMarkup =
        keyboardSendMediaCardInline(
            session.mediaId,
            session.mediaType,
            session.contentType,
            session.media.genres,
            false,
            'channel'
        )

    console.log('[publishAdminInlineMedia]', session.contentType)


    let publishedMessage


    if (type === 'photo') {

        publishedMessage =
            await ctx.telegram.sendPhoto(
                channelId,
                fileId,
                {
                    caption:
                    session.currentCaption,

                    parse_mode:
                        'HTML',

                    reply_markup:
                    channelReplyMarkup
                }
            )
    }


    if (type === 'video') {

        publishedMessage =
            await ctx.telegram.sendVideo(
                channelId,
                fileId,
                {
                    caption:
                    session.currentCaption,

                    parse_mode:
                        'HTML',

                    reply_markup:
                    channelReplyMarkup
                }
            )
    }


    if (!publishedMessage) {

        await ctx.answerCbQuery(
            'Не удалось опубликовать'
        )

        return
    }


    /*
     * 1. Сохраняем новую публикацию
     *    с текущей версией клавиатуры
     */

    try {

        await $fetch(
            '/api/bot/publishedMedia/create',
            {
                method: 'POST',

                body: {

                    telegramChatId:
                    channelId,

                    telegramMessageId:
                    publishedMessage.message_id,

                    mediaId:
                    session.mediaId,

                    mediaType:
                    session.mediaType,

                    contentType:
                    session.contentType,

                    keyboardVersion:
                    CURRENT_KEYBOARD_VERSION
                }
            }
        )


    } catch (error) {

        console.error(
            '[PUBLISHED MEDIA SAVE ERROR]',
            error
        )

        await ctx.answerCbQuery(
            'Карточка опубликована, но не сохранена в истории'
        )

        return
    }


    /*
     * 2. Проверяем старые публикации
     *    и при необходимости обновляем клавиатуры
     */

    try {

        await $fetch(
            '/api/bot/publishedMedia/syncKeyboards',
            {
                method: 'POST'
            }
        )


    } catch (error) {

        console.error(
            '[KEYBOARD SYNC ERROR]',
            error
        )
    }


    /*
     * 3. Возвращаем inline-карточке
     *    обычную inline-клавиатуру
     */

    await ctx.telegram.editMessageReplyMarkup(
        undefined,
        undefined,
        session.inlineMessageId,
        {
            reply_markup:
                keyboardSendMediaCardInline(
                    session.mediaId,
                    session.mediaType,
                    session.contentType,
                    session.media.genres,
                    false,
                    'inline'
                )
        }
    )

    console.log('[publishAdminInlineMedia] all', session.contentType)


    clearAdminEditSession(
        ctx.from.id
    )


    await ctx.answerCbQuery(
        'Опубликовано'
    )
}

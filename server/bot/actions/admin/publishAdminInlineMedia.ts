import {clearAdminEditSession, getAdminEditSession} from "#server/bot/actions/admin/adminEditSession"
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot"
import {CURRENT_KEYBOARD_VERSION} from "#server/bot/consts/keyboardVersion/keyboardVersion"
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption"

export const publishAdminInlineMedia = async (ctx: any) => {

    const [, mediaId, mediaType, contentType] = ctx.match
    const parsedMediaId = Number(mediaId)

    const session = getAdminEditSession(ctx.from.id)

    const isCurrentSession =
        session &&

        session.mediaId ===
        parsedMediaId &&

        session.mediaType ===
        mediaType &&

        session.contentType ===
        contentType


    let media


    let currentMedia


    let currentCaption


    if (
        isCurrentSession
    ) {

        media =
            session.media


        currentMedia =
            session.currentMedia


        currentCaption =
            session.currentCaption

    } else {

        media =
            await $fetch(
                '/api/bot/getMediaBot',
                {
                    query: {

                        id:
                        parsedMediaId,

                        media:
                        mediaType
                    }
                }
            )


        currentMedia = {

            type:
                'photo' as const,

            fileId:
                `https://image.tmdb.org/t/p/w500${
                    media.poster_path ||
                    media.backdrop_path
                }`
        }


        currentCaption =
            createMediaCaption(
                media,
                contentType
            )
    }


    const channelId =
        '@kinomanovnet'


    const channelReplyMarkup =
        keyboardSendMediaCardInline(
            parsedMediaId,
            mediaType,
            contentType,
            media.genres,
            false,
            'channel'
        )


    let publishedMessage


    if (
        currentMedia.type ===
        'photo'
    ) {

        publishedMessage =
            await ctx.telegram.sendPhoto(
                channelId,
                currentMedia.fileId,
                {

                    caption:
                    currentCaption,

                    parse_mode:
                        'HTML',

                    reply_markup:
                    channelReplyMarkup
                }
            )
    }


    if (
        currentMedia.type ===
        'video'
    ) {

        publishedMessage =
            await ctx.telegram.sendVideo(
                channelId,
                currentMedia.fileId,
                {

                    caption:
                    currentCaption,

                    parse_mode:
                        'HTML',

                    reply_markup:
                    channelReplyMarkup
                }
            )
    }


    if (
        !publishedMessage
    ) {

        await ctx.answerCbQuery(
            'Не удалось опубликовать'
        )

        return
    }


    try {

        await $fetch(
            '/api/bot/publishedMedia/create',
            {

                method:
                    'POST',

                body: {

                    telegramChatId:
                    channelId,

                    telegramMessageId:
                    publishedMessage.message_id,

                    mediaId:
                    parsedMediaId,

                    mediaType,

                    contentType,

                    keyboardVersion:
                    CURRENT_KEYBOARD_VERSION
                }
            }
        )

    } catch (
        error
        ) {

        console.error(
            '[PUBLISHED MEDIA SAVE ERROR]',
            error
        )


        await ctx.answerCbQuery(
            'Карточка опубликована, но не сохранена в истории'
        )


        return
    }


    try {

        await $fetch(
            '/api/bot/publishedMedia/syncKeyboards',
            {

                method:
                    'POST'
            }
        )

    } catch (
        error
        ) {

        console.error(
            '[KEYBOARD SYNC ERROR]',
            error
        )
    }


    await ctx.telegram.editMessageReplyMarkup(
        undefined,
        undefined,
        ctx.callbackQuery.inline_message_id,

        {

            reply_markup:
                keyboardSendMediaCardInline(
                    parsedMediaId,
                    mediaType,
                    contentType,
                    media.genres,
                    false,
                    'inline'
                )
        }
    )


    clearAdminEditSession(
        ctx.from.id
    )


    await ctx.answerCbQuery(
        'Опубликовано'
    )
}

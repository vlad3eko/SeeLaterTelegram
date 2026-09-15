import {
    type AdminEditSession,
    clearAdminEditSession,
    getAdminEditSession
} from "#server/bot/actions/admin/adminEditSession"
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot"
import {CURRENT_KEYBOARD_VERSION} from "#server/bot/consts/keyboardVersion/keyboardVersion"
import {tmdbFetch} from "#server/utils/api/tmdbFetch"
import {getMediaSaveCount} from "#server/bot/consts/keyboardVersion/getMediaSaveCount";
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";
import {CHANEL_LINK} from "#server/bot/bot";
import {resolveRichCard} from "#server/global/engine/card/engineRichCard";

export const publishAdminInlineMedia = async (ctx: any) => {

    const [
        ,
        mediaId,
        mediaType,
        contentType,
        keyTrailer
    ] = ctx.match

    const media =
        await tmdbFetch('/api/bot/getMediaBot', {
            query: {
                id: mediaId,
                media: mediaType
            }
        })

    const session: AdminEditSession =
        getAdminEditSession(ctx.from.id) ?? {
            inlineMessageId:
            ctx.callbackQuery.inline_message_id,
            mediaId:
                Number(mediaId),
            mediaType,
            media,
            contentType,
            keyTrailer,
            comment: undefined,
            overview: undefined,
            currentMedia: {
                type: 'photo',
                fileId:
                    `https://image.tmdb.org/t/p/original${
                        media.poster_path ||
                        media.backdrop_path
                    }`
            }
        }

    const channelId =
        CHANEL_LINK

    const saveCount =
        getMediaSaveCount(session.mediaId)

    const {
        caption,
        keyboard
    } =
        await resolveRichCard(
            {
                ctx,
                inlineMessageId:
                session.inlineMessageId,
                isAdmin: false
            },
            {
                id: session.mediaId,
                type: session.mediaType,
                status: 'ready',
                contentType: session.contentType,
                addComment: session.comment,
                addOverview: session.overview,
                keyTrailer: session.keyTrailer,
                mediaOverride: session.currentMedia
            }
        )

    const channelReplyMarkup =
        keyboardSendMediaCardInline(
            session.mediaId,
            session.mediaType,
            session.contentType,
            session.media.genres,
            false,
            'channel',
            await saveCount,
            session.keyTrailer,
        )

    let publishedMessage

    try {
        publishedMessage =
            await ctx.telegram.callApi(
                'sendRichMessage',
                {
                    chat_id: channelId,
                    rich_message: caption,
                    reply_markup: channelReplyMarkup
                }
            )
    } catch (error) {
        console.error('[RICH MESSAGE PUBLISH ERROR]', error)
        await ctx.answerCbQuery(
            NOTIFICATION_MESSAGE.CbQ.ErrorPublished
        )
        return
    }

    try {
        await $fetch(
            '/api/bot/publishedMedia/create',
            {
                method: 'POST',
                body: {
                    telegramChatId: channelId,
                    telegramMessageId: publishedMessage.message_id,
                    mediaId: session.mediaId,
                    mediaType: session.mediaType,
                    contentType: session.contentType,
                    keyboardVersion: CURRENT_KEYBOARD_VERSION,
                    keyTrailer: session.keyTrailer,
                }
            }
        )
    } catch (error) {
        console.error('[PUBLISHED MEDIA SAVE ERROR]', error)
        await ctx.answerCbQuery(
            'Карточка опубликована, но не сохранена в истории'
        )
        return
    }

    await ctx.answerCbQuery(
        NOTIFICATION_MESSAGE.CbQ.SuccessPublished
    )

    try {
        await $fetch(
            '/api/bot/publishedMedia/syncKeyboards',
            {
                method: 'POST'
            }
        )
    } catch (error) {
        console.log('[KEYBOARD SYNC ERROR]', error)
    }

    try {
        if (session.inlineMessageId) {
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
                            'inline',
                            await saveCount,
                            session.keyTrailer,
                        )
                }
            )
        }
    } catch (error: any) {
        if (
            error?.response?.description !==
            "Bad Request: message is not modified"
        ) {
            console.log(
                '[PUBLISHED MEDIA session.inlineMessageID ERROR]',
                error
            )
        }
    }

    clearAdminEditSession(ctx.from.id)
}

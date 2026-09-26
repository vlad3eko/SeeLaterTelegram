import {type AdminEditSession, clearAdminEditSession, getAdminEditSession
} from "#server/bot/actions/admin/adminEditSession";
import {CHANEL_LINK} from "#server/bot/bot";
import {prepareReel} from "#server/global/engine/instagram/prepareReel";
import {getMediaSaveCount} from "#server/bot/consts/keyboardVersion/getMediaSaveCount";
import {resolveRichCard} from "#server/global/engine/card/engineRichCard";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";
import {CURRENT_KEYBOARD_VERSION} from "#server/bot/consts/keyboardVersion/keyboardVersion";
import {createInstagramCaption} from "#server/global/engine/instagram/reel/caption/createInstagramCaption";
import {publishInstagramReel} from "#server/global/publishers/instagram/publishInstagramReel";
import {createInstagramHook} from "#server/global/engine/instagram/reel/caption/getInstagramMediaType";

export const publishAdminInlineMedia = async (ctx: any) => {

    const [
        ,
        mediaId,
        mediaType,
        contentType,
        keyTrailer
    ] = ctx.match

    const channelId =
        CHANEL_LINK

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

    let preparedInstagram =
        session.preparedInstagram

    if (keyTrailer && !session.keyTrailer)
        session.keyTrailer = keyTrailer

    if (!preparedInstagram && session.keyTrailer) {

        try {
            session.mode = 'publish'

            const instagramHook =
                createInstagramHook(session.mediaType, session.contentType)

            const prepared =
                await prepareReel(session.keyTrailer, instagramHook, ctx, {id: session.mediaId, type: session.mediaType}, session.mode)

            preparedInstagram = {
                keyTrailer: session.keyTrailer,
                reelR2: prepared.reelR2,
                telegramFileId: prepared.telegramFileId
            }


            session.preparedInstagram =
                preparedInstagram


        } catch (error) {

            console.error(
                '[PUBLICATION MEDIA PREPARE ERROR]',
                error
            )


            await ctx.answerCbQuery(
                'Не удалось подготовить трейлер'
            )


            return
        }
    }


    /*
     * =========================
     * CURRENT MEDIA
     * =========================
     *
     * Здесь берём именно то,
     * что сейчас прикреплено
     * к редактируемой карточке.
     *
     * Если sessionCurrentMedia()
     * уже получил видео:
     *
     * {
     *     type: 'video',
     *     fileId: '...'
     * }
     *
     * то именно это видео попадёт
     * в публикуемую Rich Card.
     */

    const currentMedia =
        session.currentMedia?.type === 'video'
            ? {
                type: 'video' as const,

                fileId:
                session.currentMedia.fileId
            }
            : {
                type: 'photo' as const,

                fileId:
                    `https://image.tmdb.org/t/p/original${
                        media.poster_path ||
                        media.backdrop_path
                    }`
            }


    /*
     * =========================
     * SAVE COUNT
     * =========================
     */

    const saveCount =
        await getMediaSaveCount(
            session.mediaId
        )


    /*
     * =========================
     * BUILD TELEGRAM CARD
     * =========================
     *
     * ВАЖНО:
     *
     * resolveRichCard() здесь НЕ меняем.
     *
     * Просто передаём ему текущий mediaOverride.
     *
     * Если это video —
     * resolveRichCard() построит:
     *
     * caption
     * +
     * video block
     * +
     * остальные блоки карточки.
     *
     * Если это photo —
     * будет обычная карточка с постером.
     */

    const {
        caption
    } =
        await resolveRichCard(
            {
                ctx,

                inlineMessageId:
                session.inlineMessageId,

                isAdmin: false
            },
            {
                id:
                session.mediaId,

                type:
                session.mediaType,

                status:
                    'ready',

                contentType:
                session.contentType,

                addComment:
                session.comment,

                addOverview:
                session.overview,

                keyTrailer:
                session.keyTrailer,

                mediaOverride:
                currentMedia
            }
        )


    /*
     * =========================
     * CHANNEL KEYBOARD
     * =========================
     */

    const channelReplyMarkup =
        keyboardSendMediaCardInline(
            session.mediaId,
            session.mediaType,
            session.contentType,
            session.media.genres,
            false,
            'channel',
            saveCount,
            session.keyTrailer
        )


    /*
     * =========================
     * TELEGRAM PUBLISH
     * =========================
     *
     * Всегда используем sendRichMessage.
     *
     * Не sendVideo().
     *
     * Потому что caption здесь —
     * это не обычный Telegram caption,
     * а полноценная Rich Message структура.
     *
     * Если currentMedia = video,
     * видео уже находится внутри
     * caption, сформированного
     * resolveRichCard().
     */

    let publishedMessage


    try {

        publishedMessage =
            await ctx.telegram.callApi(
                'sendRichMessage',
                {
                    chat_id:
                    channelId,

                    rich_message:
                    caption,

                    reply_markup:
                    channelReplyMarkup
                }
            )


    } catch (error) {

        console.error(
            '[RICH MESSAGE PUBLISH ERROR]',
            error
        )


        await ctx.answerCbQuery(
            NOTIFICATION_MESSAGE.CbQ.ErrorPublished
        )


        return
    }


    /*
     * =========================
     * SAVE TELEGRAM PUBLICATION
     * =========================
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
                    CURRENT_KEYBOARD_VERSION,

                    keyTrailer:
                    session.keyTrailer
                }
            }
        )


    } catch (error) {

        console.error(
            '[PUBLISHED MEDIA SAVE ERROR]',
            error
        )


        /*
         * Telegram уже опубликован.
         *
         * Поэтому его не удаляем.
         */

        await ctx.answerCbQuery(
            'Карточка опубликована, но не сохранена в истории'
        )


        clearAdminEditSession(
            ctx.from.id
        )


        return
    }


    /*
     * =========================
     * INSTAGRAM
     * =========================
     *
     * Если трейлер был подготовлен,
     * используем уже существующий reelR2.
     *
     * Повторного скачивания
     * и обработки нет.
     */

    if (
        preparedInstagram?.reelR2
    ) {

        try {

            const instagramCaption =
                createInstagramCaption({
                    media,

                    comment:
                    session.comment,

                    overview:
                    session.overview,

                    contentType:
                    session.contentType
                })


            const instagram =
                await publishInstagramReel({
                    videoUrl:
                    preparedInstagram.reelR2,

                    caption:
                    instagramCaption
                })


            console.log(
                '[INSTAGRAM PUBLISHED]',
                JSON.stringify(
                    instagram,
                    null,
                    2
                )
            )


        } catch (error) {

            console.error(
                '[INSTAGRAM PUBLISH ERROR]',
                error
            )


            await ctx.answerCbQuery(
                'Telegram опубликован, Instagram не удалось опубликовать'
            )


            clearAdminEditSession(
                ctx.from.id
            )


            return
        }
    }


    /*
     * =========================
     * KEYBOARD SYNC
     * =========================
     *
     * Синхронизируем клавиатуры
     * уже опубликованных карточек.
     */

    try {

        await $fetch(
            '/api/bot/publishedMedia/syncKeyboards',
            {
                method: 'POST'
            }
        )


    } catch (error) {

        console.log(
            '[KEYBOARD SYNC ERROR]',
            error
        )
    }


    /*
     * =========================
     * RESTORE INLINE KEYBOARD
     * =========================
     */

    try {

        if (
            session.inlineMessageId
        ) {

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
                            saveCount,
                            session.keyTrailer
                        )
                }
            )
        }


    } catch (error: any) {

        if (
            error?.response?.description !==
            'Bad Request: message is not modified'
        ) {

            console.log(
                '[PUBLISHED MEDIA session.inlineMessageID ERROR]',
                error
            )
        }
    }


    /*
     * =========================
     * CLEAN SESSION
     * =========================
     */

    clearAdminEditSession(
        ctx.from.id
    )
}

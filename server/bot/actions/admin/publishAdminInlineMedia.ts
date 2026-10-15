import {
    type AdminEditSession, clearAdminEditSession, getAdminEditSession, setAdminEditSession, updateAdminEditSession
} from "#server/bot/actions/admin/adminEditSession";
import {CHANEL_LINK} from "#server/bot/bot";
import {prepareReel} from "#server/global/engine/instagram/reel/prepareReel";
import {getMediaSaveCount} from "#server/bot/consts/keyboardVersion/getMediaSaveCount";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {NOTIFICATION_MESSAGE} from "#server/global/notifications/sendNotificationMessage";
import {CURRENT_KEYBOARD_VERSION} from "#server/bot/consts/keyboardVersion/keyboardVersion";
import {createInstagramCaption} from "#server/global/engine/instagram/reel/caption/createInstagramCaption";
import {publishInstagramReel} from "#server/global/publishers/instagram/publishInstagramReel";
import {createInstagramHook} from "#server/global/engine/instagram/reel/caption/getInstagramMediaType";
import {constructRichCard} from "#server/global/engine/card/construct/constructRichCard";
import {isAdminEditSessionForContext} from "#server/bot/actions/admin/helpers/isAdminEditSessionForContext";

export const publishAdminInlineMedia = async (ctx: any) => {

    const [, mediaId, mediaType, contentType, keyTrailer] = ctx.match

    const channelId = CHANEL_LINK
    const parsedMediaId = Number(mediaId)

    const notifyAdmin = async (text: string) => {
        try {
            await ctx.telegram.sendMessage(ctx.from.id, text)
        } catch (error: any) {
            console.error('[PUBLISH ADMIN NOTIFICATION ERROR]',
                error?.response?.description
                || error?.message
                || error
            )
        }
    }
    const answerCallbackQuerySafely = async (text: string) => {

        try {

            await ctx.answerCbQuery(text)

        } catch (error: any) {

            console.warn(
                '[PUBLISH CALLBACK ACK SKIPPED]',
                error?.response?.description ||
                error?.message ||
                error
            )
        }
    }
    // Отвечаем Telegram сразу, а не после долгой обработки видео.
    // Подтверждаем нажатие кнопки сразу.
    await answerCallbackQuerySafely('Публикация запущена')
    const updateId = Number(ctx.update?.update_id)

    let claim: {
        claimed: boolean
    }

    try {
        claim = await $fetch('/api/bot/updates/claim', {
            method: 'POST',
            body: {
                    update_id: updateId,
                    handler: 'publishAdminInlineMedia'
                }
            }
        )

    } catch (error) {
        console.error('[PUBLISH IDEMPOTENCY CLAIM ERROR]', error)
        await notifyAdmin('Не удалось проверить защиту от повторной публикации. Публикация остановлена; попробуй позже.')
        return
    }

    if (!claim.claimed) {
        console.warn('[PUBLISH DUPLICATE IGNORED]', {updateId, callbackQueryId: ctx.callbackQuery?.id})
        return
    }
    const existingSession = await getAdminEditSession(ctx.from.id)

    const samePublicationSession =
        existingSession &&
        existingSession.mediaId === parsedMediaId &&
        existingSession.mediaType === mediaType &&
        existingSession.contentType === contentType

    const lockStartedAt = Number(existingSession?.publishStartedAt ?? 0)

    const lockAge =
        lockStartedAt > 0
            ? Date.now() - lockStartedAt
            : Number.POSITIVE_INFINITY

    // Повторная доставка того же действия не запускает публикацию заново.
    // Через 10 минут зависшую блокировку можно будет обойти.
    if (
        samePublicationSession &&
        existingSession.mode === 'publish' &&
        lockAge >= 0 &&
        lockAge < 10 * 60 * 1000
    ) {

        console.warn(
            '[PUBLISH DUPLICATE IGNORED]',
            {
                updateId: ctx.update?.update_id,
                callbackQueryId: ctx.callbackQuery?.id,
                mediaId: parsedMediaId,
                lockAge
            }
        )

        return
    }

    let session =
        existingSession &&
        isAdminEditSessionForContext(
            ctx,
            existingSession,
            parsedMediaId,
            mediaType,
            contentType
        )
            ? existingSession
            : null

    const media =
        session?.media ??
        await tmdbFetch(
            '/api/bot/getMediaBot',
            {
                query: {
                    id: parsedMediaId,
                    media: mediaType
                }
            }
        )

    if (!session) {
        session = {
            inlineMessageId: ctx.callbackQuery.inline_message_id,
            mediaId: parsedMediaId,
            mediaType,
            media,
            contentType,
            keyTrailer: keyTrailer || undefined,
            comment: undefined,
            overview: undefined,
            mode: undefined,
            currentMedia: {
                type: 'photo',
                fileId: `https://image.tmdb.org/t/p/original${media.poster_path || media.backdrop_path}`
            }
        }
        await setAdminEditSession(ctx.from.id, session)
    }

    if (keyTrailer !== undefined && session.keyTrailer !== keyTrailer) {
        session.keyTrailer = keyTrailer || undefined
        session.preparedInstagram = undefined
        await updateAdminEditSession(ctx.from.id, {keyTrailer: keyTrailer || null, preparedInstagram: null})
    }

    const publishLockStartedAt = Date.now()

    await updateAdminEditSession(ctx.from.id, {
        mode: 'publish',
        publishStartedAt: publishLockStartedAt
    })

    session.mode = 'publish'
    session.publishStartedAt = publishLockStartedAt

    let preparedInstagram = session.preparedInstagram

// Проверяем, соответствует ли сохранённый результат
// текущему трейлеру и содержит ли готовый Reel в R2.
    if (preparedInstagram
        && (preparedInstagram.keyTrailer !== session.keyTrailer
            || typeof preparedInstagram.reelR2 !== 'string'
            || !preparedInstagram.reelR2.trim())) {

        preparedInstagram = undefined
        session.preparedInstagram = undefined

        await updateAdminEditSession(ctx.from.id, {preparedInstagram: null})
    }

// Если готового Reel нет, создаём его.
// Одного telegramFileId недостаточно для Instagram.
    if (!preparedInstagram && session.keyTrailer) {
        const trailerKey = session.keyTrailer

        try {
            const instagramHook = createInstagramHook(session.mediaType, session.contentType)

            const prepared = await prepareReel(trailerKey, instagramHook, ctx, {
                    id: session.mediaId,
                    type: session.mediaType
                },
                'publish'
            )

            // Защита от ситуации, когда prepareReel
            // не вернул URL готового Reel.
            if (typeof prepared.reelR2 !== 'string' || !prepared.reelR2.trim()) {
                throw createError({
                    statusCode: 400,
                    message: '[PUBLICATION MEDIA PREPARE ERROR] prepareReel did not return reelR2'
                    }
                )
            }

            preparedInstagram = {
                keyTrailer: trailerKey,
                reelR2: prepared.reelR2,
                telegramFileId: prepared.telegramFileId
            }

            session.preparedInstagram = preparedInstagram

            await updateAdminEditSession(ctx.from.id, {
                preparedInstagram
            })

        } catch (error) {
            console.error(
                '[PUBLICATION MEDIA PREPARE ERROR]',
                error
            )

            await updateAdminEditSession(ctx.from.id, {
                mode: null
            })

            session.mode = undefined

            await notifyAdmin(
                'Не удалось подготовить трейлер'
            )

            return
        }
    }

    const currentMedia = session.currentMedia ?? {
        type: 'photo' as const,
        fileId: `https://image.tmdb.org/t/p/original${media.poster_path || media.backdrop_path}`
    }
    const saveCount = await getMediaSaveCount(session.mediaId)
    const {caption} = await constructRichCard({
        ctx,
        inlineMessageId: session.inlineMessageId,
        isAdmin: false
    }, {
        id: session.mediaId,
        type: session.mediaType,
        status: 'ready',
        contentType: session.contentType,
        addComment: session.comment,
        addOverview: session.overview,
        keyTrailer: session.keyTrailer,
        mediaOverride: currentMedia
    })
    const channelReplyMarkup = keyboardSendMediaCardInline(session.mediaId, session.mediaType, session.contentType, session.media.genres, false, 'channel', saveCount, session.keyTrailer)
    let publishedMessage

    try {
        publishedMessage = await ctx.telegram.callApi('sendRichMessage', {
            chat_id: channelId,
            rich_message: caption,
            reply_markup: channelReplyMarkup
        })
    } catch (error) {

        await updateAdminEditSession(ctx.from.id, {mode: null, publishStartedAt: null})
        session.mode = undefined
        await notifyAdmin(NOTIFICATION_MESSAGE.CbQ.ErrorPublished)

        return
    }

    try {
        await $fetch('/api/bot/publishedMedia/create', {
            method: 'POST',
            body: {
                telegramChatId: channelId,
                telegramMessageId: publishedMessage.message_id,
                mediaId: session.mediaId,
                mediaType: session.mediaType,
                contentType: session.contentType,
                keyboardVersion: CURRENT_KEYBOARD_VERSION,
                keyTrailer: session.keyTrailer
            }
        })
    } catch (error) {
        console.error('[PUBLISHED MEDIA SAVE ERROR]', error)
        await notifyAdmin('Карточка опубликована, но не сохранена в истории')
        await clearAdminEditSession(ctx.from.id)
        return
    }

    if (preparedInstagram?.reelR2) {
        try {
            const instagramCaption = createInstagramCaption({
                media,
                comment: session.comment,
                overview: session.overview,
                contentType: session.contentType
            })
            const instagram = await publishInstagramReel({
                videoUrl: preparedInstagram.reelR2,
                caption: instagramCaption
            })
            console.log('[INSTAGRAM PUBLISHED]', JSON.stringify(instagram, null, 2))
        } catch (error) {
            console.error('[INSTAGRAM PUBLISH ERROR]', error)
            await notifyAdmin('Telegram опубликован, Instagram не удалось опубликовать')
            await clearAdminEditSession(ctx.from.id)
            return
        }
    }

    try {
        await $fetch('/api/bot/publishedMedia/syncKeyboards', {method: 'POST'})
    } catch (error) {
        console.log('[KEYBOARD SYNC ERROR]', error)
    }

    try {
        if (session.inlineMessageId) {
            await ctx.telegram.editMessageReplyMarkup(undefined, undefined, session.inlineMessageId, {
                reply_markup: keyboardSendMediaCardInline(
                    session.mediaId,
                    session.mediaType,
                    session.contentType,
                    session.media.genres,
                    false,
                    'inline',
                    saveCount,
                    session.keyTrailer)})
        }
    } catch (error: any) {
        if (error?.response?.description !== 'Bad Request: message is not modified') {
            console.log('[PUBLISHED MEDIA session.inlineMessageID ERROR]', error)
        }
    }

    await clearAdminEditSession(ctx.from.id)
    await notifyAdmin(preparedInstagram?.reelR2
        ? 'Опубликовано в Telegram и Instagram'
        : 'Опубликовано в Telegram'
    )
}

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
    const existingSession = await getAdminEditSession(ctx.from.id)
    let session = existingSession && isAdminEditSessionForContext(ctx, existingSession, parsedMediaId, mediaType, contentType) ? existingSession : null
    const media = session?.media ?? await tmdbFetch('/api/bot/getMediaBot', { query: { id: parsedMediaId, media: mediaType } })

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
        await updateAdminEditSession(ctx.from.id, { keyTrailer: keyTrailer || null, preparedInstagram: null })
    }

    let preparedInstagram = session.preparedInstagram
    if (preparedInstagram && preparedInstagram.keyTrailer !== session.keyTrailer) {
        preparedInstagram = undefined
        session.preparedInstagram = undefined
        await updateAdminEditSession(ctx.from.id, { preparedInstagram: null })
    }

    if (!preparedInstagram && session.keyTrailer) {
        await updateAdminEditSession(ctx.from.id, { mode: 'publish' })
        try {
            const instagramHook = createInstagramHook(session.mediaType, session.contentType)
            const prepared = await prepareReel(session.keyTrailer, instagramHook, ctx, { id: session.mediaId, type: session.mediaType }, 'publish')
            preparedInstagram = { keyTrailer: session.keyTrailer, reelR2: prepared.reelR2, telegramFileId: prepared.telegramFileId }
            session.preparedInstagram = preparedInstagram
            await updateAdminEditSession(ctx.from.id, { preparedInstagram })
        } catch (error) {
            console.error('[PUBLICATION MEDIA PREPARE ERROR]', error)
            await updateAdminEditSession(ctx.from.id, { mode: null })
            session.mode = undefined
            await ctx.answerCbQuery('Не удалось подготовить трейлер')
            return
        }
    }

    const currentMedia = session.currentMedia ?? { type: 'photo' as const, fileId: `https://image.tmdb.org/t/p/original${media.poster_path || media.backdrop_path}` }
    const saveCount = await getMediaSaveCount(session.mediaId)
    const {caption} = await constructRichCard({ ctx, inlineMessageId: session.inlineMessageId, isAdmin: false }, { id: session.mediaId, type: session.mediaType, status: 'ready', contentType: session.contentType, addComment: session.comment, addOverview: session.overview, keyTrailer: session.keyTrailer, mediaOverride: currentMedia })
    const channelReplyMarkup = keyboardSendMediaCardInline(session.mediaId, session.mediaType, session.contentType, session.media.genres, false, 'channel', saveCount, session.keyTrailer)
    let publishedMessage

    try {
        publishedMessage = await ctx.telegram.callApi('sendRichMessage', { chat_id: channelId, rich_message: caption, reply_markup: channelReplyMarkup })
    } catch (error) {
        console.error('[RICH MESSAGE PUBLISH ERROR]', error)
        await updateAdminEditSession(ctx.from.id, { mode: null })
        session.mode = undefined
        await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.ErrorPublished)
        return
    }

    try {
        await $fetch('/api/bot/publishedMedia/create', { method: 'POST', body: { telegramChatId: channelId, telegramMessageId: publishedMessage.message_id, mediaId: session.mediaId, mediaType: session.mediaType, contentType: session.contentType, keyboardVersion: CURRENT_KEYBOARD_VERSION, keyTrailer: session.keyTrailer } })
    } catch (error) {
        console.error('[PUBLISHED MEDIA SAVE ERROR]', error)
        await ctx.answerCbQuery('Карточка опубликована, но не сохранена в истории')
        await clearAdminEditSession(ctx.from.id)
        return
    }

    if (preparedInstagram?.reelR2) {
        try {
            const instagramCaption = createInstagramCaption({ media, comment: session.comment, overview: session.overview, contentType: session.contentType })
            const instagram = await publishInstagramReel({ videoUrl: preparedInstagram.reelR2, caption: instagramCaption })
            console.log('[INSTAGRAM PUBLISHED]', JSON.stringify(instagram, null, 2))
            await ctx.reply('[INSTAGRAM PUBLISHED]')
        } catch (error) {
            console.error('[INSTAGRAM PUBLISH ERROR]', error)
            await ctx.answerCbQuery('Telegram опубликован, Instagram не удалось опубликовать')
            await clearAdminEditSession(ctx.from.id)
            return
        }
    }

    try {
        await $fetch('/api/bot/publishedMedia/syncKeyboards', { method: 'POST' })
    } catch (error) {
        console.log('[KEYBOARD SYNC ERROR]', error)
    }

    try {
        if (session.inlineMessageId) {
            await ctx.telegram.editMessageReplyMarkup(undefined, undefined, session.inlineMessageId, { reply_markup: keyboardSendMediaCardInline(session.mediaId, session.mediaType, session.contentType, session.media.genres, false, 'inline', saveCount, session.keyTrailer) })
        }
    } catch (error: any) {
        if (error?.response?.description !== 'Bad Request: message is not modified') {
            console.log('[PUBLISHED MEDIA session.inlineMessageID ERROR]', error)
        }
    }

    await clearAdminEditSession(ctx.from.id)
    await ctx.answerCbQuery(NOTIFICATION_MESSAGE.CbQ.SuccessPublishedDone)
}

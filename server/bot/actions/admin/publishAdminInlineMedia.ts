import {
    clearAdminEditSession, getAdminEditSession, setAdminEditSession, updateAdminEditSession
} from "#server/bot/actions/admin/adminEditSession";
import {CHANEL_LINK, URL_ACTIVE} from "#server/bot/bot";
import {getMediaSaveCount} from "#server/bot/consts/keyboardVersion/getMediaSaveCount";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {NOTIFICATION_MESSAGE, notifyAdmin} from "#server/global/notifications/sendNotificationMessage";
import {CURRENT_KEYBOARD_VERSION} from "#server/bot/consts/keyboardVersion/keyboardVersion";
import {isAdminEditSessionForContext} from "#server/bot/actions/admin/helpers/isAdminEditSessionForContext";
import {removeMessageSession} from "#server/bot/services/session/removeMessageSession";
import {constructRichCard} from "#server/global/engine/card/construct/constructRichCard";
import {dispatchReelJob} from "#server/global/engine/instagram/reel/jobs/dispatchReelJob";
import {internalFetch, internalTmdbFetch} from "#server/utils/api/internalFetch";
import {ADMIN_PUBLISH_CARD} from "#server/bot/callbacks/routes";
import {sendReelReviewStatus} from "#server/bot/actions/admin/reelReview/reelReviewMessages";

export const publishAdminInlineMedia = async (ctx: any) => {
    const {
        mediaId: parsedMediaId,
        mediaType,
        contentType,
        keyTrailer,
        isRichTypeCard
    } = ADMIN_PUBLISH_CARD.parse(ctx)

    const channelId = CHANEL_LINK

    const answerCallbackQuerySafely = async (text: string) => {
        try {
            await ctx.answerCbQuery(text)
        } catch (error: any) {
            console.warn(
                '[PUBLISH CALLBACK ACK SKIPPED]',
                error?.response?.description || error?.message || error
            )
        }
    }

    // Telegram callback подтверждаем сразу: обработка видео больше не выполняется
    // внутри webhook, а передаётся отдельному Cloud Run Job.
    await answerCallbackQuerySafely('Публикация запущена')

    const updateId = Number(ctx.update?.update_id)
    const existingSession = await getAdminEditSession(ctx.from.id)

    const samePublicationSession =
        existingSession &&
        existingSession.mediaId === parsedMediaId &&
        existingSession.mediaType === mediaType &&
        existingSession.contentType === contentType

    const lockStartedAt = Number(existingSession?.publishStartedAt ?? 0)
    const lockAge = lockStartedAt > 0
        ? Date.now() - lockStartedAt
        : Number.POSITIVE_INFINITY

    // Повторная доставка не должна повторно запускать уже выполняющуюся операцию.
    // После 10 минут можно повторить зависшую публикацию.
    if (
        samePublicationSession &&
        existingSession.mode === 'publish' &&
        lockAge >= 0 &&
        lockAge < 10 * 60 * 1000
    ) {
        console.warn('[PUBLISH DUPLICATE IGNORED]', {
            updateId,
            callbackQueryId: ctx.callbackQuery?.id,
            mediaId: parsedMediaId,
            lockAge
        })
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

    const media = session?.media ?? await internalTmdbFetch(
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
        // Ключ из кнопки карточки отличается от сессии: ручной ключ больше не действует.
        session.keyTrailer = keyTrailer || undefined
        session.preparedInstagram = undefined
        session.trailerKeySource = undefined
        session.videoType = undefined
        await updateAdminEditSession(ctx.from.id, {
            keyTrailer: keyTrailer || null,
            preparedInstagram: null,
            trailerKeySource: null,
            videoType: null
        })
    }

    // Готовый Reel из сессии больше не используется. Раньше его собирал режим download на Vercel, и в
    // сохранённых сессиях мог остаться ссылка на такой (старый) файл. Reel собирает только воркер,
    // поэтому остаток из старой сессии стираем, чтобы он никогда не ушёл в Instagram.
    if (session.preparedInstagram) {
        session.preparedInstagram = undefined
        await updateAdminEditSession(ctx.from.id, {preparedInstagram: null})
    }

    const currentMedia = session.currentMedia ?? {
        type: 'photo' as const,
        fileId: `https://image.tmdb.org/t/p/original${media.poster_path || media.backdrop_path}`
    }

    // Единственный долгий этап — подготовка видео. Создаём durable job,
    // запускаем Cloud Run и выходим из Telegram webhook.
    if (session.keyTrailer) {
        const publishLockStartedAt = Date.now()
        await updateAdminEditSession(ctx.from.id, {
            mode: 'publish',
            publishStartedAt: publishLockStartedAt
        })
        session.mode = 'publish'
        session.publishStartedAt = publishLockStartedAt

        try {
            const result = await dispatchReelJob({
                adminTelegramId: Number(ctx.from.id),
                sourceUpdateId: updateId,
                channelChatId: String(channelId),
                finalizerUrl: `${URL_ACTIVE.replace(/\/$/, '')}/api/bot/reelJobs/finalize`,
                // Ключ введён вручную: clean и хук проходят проверку администратора.
                // Любой другой запуск (ключ из карточки, будущий автоподбор) идёт без вопросов.
                reviewMode: session.trailerKeySource === 'manual' ? 'manual' : 'auto',
                session: {
                    media: session.media,
                    mediaId: session.mediaId,
                    mediaType: session.mediaType,
                    contentType: session.contentType,
                    keyTrailer: session.keyTrailer,
                    comment: session.comment,
                    overview: session.overview,
                    currentMedia,
                    inlineMessageId: session.inlineMessageId,
                    publishStartedAt: publishLockStartedAt,
                    isRichTypeCard,
                    // Тип по ручной ссылке; без выбора — трейлер (квадрат по центру).
                    videoType: session.trailerKeySource === 'manual' && session.videoType === 'clip' ? 'clip' : 'trailer'
                }
            })

            console.log('[REEL JOB ACCEPTED]', {
                jobId: result.jobId,
                status: result.status,
                reused: result.reused
            })

            if (!result.reused && session.trailerKeySource === 'manual') {
                // Ручная проверка: сообщение с кнопкой «Отменить»; его заменит clean.
                await sendReelReviewStatus(
                    {id: result.jobId, admin_telegram_id: ctx.from.id},
                    session.videoType === 'clip'
                        ? 'Нарезка поставлена в обработку. Gemini ищет удачные фрагменты: пришлю альбом вариантов на выбор (несколько минут).'
                        : 'Видео поставлено в обработку. Когда clean будет готов, пришлю его на проверку.',
                    {withCancel: true}
                )
            } else {
                await notifyAdmin(
                    ctx,
                    result.reused
                        ? 'Эта задача уже существует. Продолжаю её обработку/публикацию.'
                        : 'Видео поставлено в обработку. После подготовки публикация в Telegram и Instagram выполнится автоматически.'
                )
            }
        } catch (error) {
            console.error('[REEL JOB DISPATCH ERROR]', error)
            await updateAdminEditSession(ctx.from.id, {
                mode: null,
                publishStartedAt: null
            })
            session.mode = undefined
            session.publishStartedAt = undefined
            await notifyAdmin(ctx, 'Не удалось запустить обработку видео. Задача не отправлена; попробуй ещё раз.')
        }

        return
    }

    // Публикация без видео (нет трейлера): синхронный путь, только Telegram. Claim остаётся защитой от повторной обработки update_id.
    let claim: {claimed: boolean}
    try {
        claim = await internalFetch('/api/bot/updates/claim', {
            method: 'POST',
            body: {
                update_id: updateId,
                handler: 'publishAdminInlineMedia'
            }
        })
    } catch (error) {
        console.error('[PUBLISH IDEMPOTENCY CLAIM ERROR]', error)
        await notifyAdmin(ctx, 'Не удалось проверить защиту от повторной публикации. Публикация остановлена; попробуй позже.')
        await updateAdminEditSession(ctx.from.id, {mode: null, publishStartedAt: null})
        return
    }

    if (!claim.claimed) {
        console.warn('[PUBLISH DUPLICATE IGNORED]', {
            updateId,
            callbackQueryId: ctx.callbackQuery?.id
        })
        return
    }

    const publishLockStartedAt = Date.now()
    await updateAdminEditSession(ctx.from.id, {
        mode: 'publish',
        publishStartedAt: publishLockStartedAt
    })
    session.mode = 'publish'
    session.publishStartedAt = publishLockStartedAt

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

    const channelReplyMarkup = keyboardSendMediaCardInline(
        session.mediaId,
        session.mediaType,
        session.contentType,
        session.media.genres,
        false,
        'channel',
        saveCount,
        session.keyTrailer,
        isRichTypeCard
    )

    let publishedMessage: any
    try {
        publishedMessage = await ctx.telegram.callApi('sendRichMessage', {
            chat_id: channelId,
            rich_message: caption,
            reply_markup: channelReplyMarkup
        })
    } catch (error) {
        console.error('[TELEGRAM CHANNEL PUBLISH ERROR]', error)
        await updateAdminEditSession(ctx.from.id, {mode: null, publishStartedAt: null})
        session.mode = undefined
        await notifyAdmin(ctx, NOTIFICATION_MESSAGE.CbQ.ErrorPublished)
        return
    }

    try {
        await internalFetch('/api/bot/publishedMedia/create', {
            method: 'POST',
            body: {
                telegramChatId: channelId,
                telegramMessageId: publishedMessage.message_id,
                mediaId: session.mediaId,
                mediaType: session.mediaType,
                contentType: session.contentType,
                keyboardVersion: CURRENT_KEYBOARD_VERSION,
                keyTrailer: session.keyTrailer,
                isRichTypeCard
            }
        })
    } catch (error) {
        console.error('[PUBLISHED MEDIA SAVE ERROR]', error)
        await notifyAdmin(ctx, 'Карточка опубликована, но не сохранена в истории')
        await clearAdminEditSession(ctx.from.id)
    }

    try {
        await internalFetch('/api/bot/publishedMedia/syncKeyboards', {method: 'POST'})
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
                    reply_markup: keyboardSendMediaCardInline(
                        session.mediaId,
                        session.mediaType,
                        session.contentType,
                        session.media.genres,
                        false,
                        'inline',
                        saveCount,
                        session.keyTrailer,
                        isRichTypeCard
                    )
                }
            )
        }
    } catch (error: any) {
        if (error?.response?.description !== 'Bad Request: message is not modified') {
            console.log('[PUBLISHED MEDIA session.inlineMessageID ERROR]', error)
        }
    }

    await clearAdminEditSession(ctx.from.id)
    await notifyAdmin(ctx, NOTIFICATION_MESSAGE.reply.SuccessPublishedTelegram)
    await removeMessageSession(ctx.from.id, {inlineMessageId: ctx.inlineMessageId})
}

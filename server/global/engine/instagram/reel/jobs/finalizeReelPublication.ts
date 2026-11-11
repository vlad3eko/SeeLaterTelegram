import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {bot, CHANEL_LINK} from "#server/bot/bot";
import {SupabaseClient} from "@supabase/supabase-js";
import {randomUUID} from "node:crypto";
import {getMediaSaveCount} from "#server/bot/consts/keyboardVersion/getMediaSaveCount";
import {constructRichCard} from "#server/global/engine/card/construct/constructRichCard";
import {ContentType} from "#server/global/engine/search/strategy/enums";
import {CURRENT_KEYBOARD_VERSION} from "#server/bot/consts/keyboardVersion/keyboardVersion";
import {createInstagramCaption} from "#server/global/engine/instagram/reel/caption/createInstagramCaption";
import {publishInstagramReel} from "#server/global/publishers/instagram/publishInstagramReel";
import {deleteCloudflareR2ObjectByUrl} from "#server/global/engine/instagram/reel/utils/storageCloudflareR2";
import {resetAdminPublishLock} from "#server/global/engine/instagram/reel/jobs/adminPublishLock";

type TelegramRichMessageResponse = {
    message_id?: number
}

const telegramCallApi = bot.telegram.callApi.bind(bot.telegram) as unknown as (
    method: string,
    payload: Record<string, unknown>
) => Promise<TelegramRichMessageResponse>

type ReelJob = {
    id: string
    admin_telegram_id: number | string
    media_id: number | string
    media_type: 'movie' | 'tv'
    content_type: string
    key_trailer: string
    input_payload: Record<string, any>
    result_payload: Record<string, any> | null
    clean_r2_url: string | null
    instagram_publish_r2_url: string | null
    instagram_caption: string | null
    channel_chat_id: string | null
    channel_message_id: number | null
    instagram_media_id: string | null
    instagram_permalink: string | null
    lease_token: string | null
}

type FinalizeResult = {
    status: 'published' | 'in_progress'
    skipped?: boolean
}

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`
    }
    return String(error)
}

const asRecord = (value: unknown): Record<string, any> =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, any>
        : {}

const sendAdminNotice = async (adminTelegramId: number, message: string): Promise<void> => {
    try {
        await bot.telegram.sendMessage(adminTelegramId, message)
    } catch (error: any) {
        console.error('[REEL FINALIZER ADMIN NOTICE ERROR]', error?.response?.description || error?.message || error)
    }
}




export const finalizeReelPublication = async (
    supabase: SupabaseClient,
    jobId: string
): Promise<FinalizeResult> => {
    const leaseToken = randomUUID()
    const leaseSeconds = 240

    const {data: claimedData, error: claimError} = await supabase.rpc(
        'claim_reel_publication_job',
        {
            p_job_id: jobId,
            p_lease_token: leaseToken,
            p_lease_seconds: leaseSeconds
        }
    )

    if (claimError) {
        throw new Error(`[REEL FINALIZER CLAIM ERROR] ${claimError.message}`)
    }

    const job = (Array.isArray(claimedData) ? claimedData[0] : claimedData) as ReelJob | null

    if (!job) {
        const {data: current, error} = await supabase
            .from('reel_processing_jobs')
            .select('status,lease_expires_at')
            .eq('id', jobId)
            .maybeSingle()

        if (error) throw new Error(`[REEL FINALIZER STATUS LOOKUP ERROR] ${error.message}`)
        if (current?.status === 'published') return {status: 'published', skipped: true}
        if (current?.status === 'publishing') return {status: 'in_progress', skipped: true}

        throw new Error(`[REEL FINALIZER CLAIM] Job ${jobId} is not ready for publication (status: ${current?.status ?? 'not found'})`)
    }

    const updateOwnedJob = async (patch: Record<string, unknown>): Promise<void> => {
        const {data, error} = await supabase
            .from('reel_processing_jobs')
            .update({...patch, updated_at: new Date().toISOString()})
            .eq('id', jobId)
            .eq('lease_token', leaseToken)
            .select('id')
            .maybeSingle()

        if (error) throw new Error(`[REEL FINALIZER UPDATE ERROR] ${error.message}`)
        if (!data) throw new Error('[REEL FINALIZER LEASE LOST] Another finalizer owns this job')
    }

    let heartbeatBusy = false
    let heartbeatFailed = false
    const heartbeat = setInterval(async () => {
        if (heartbeatBusy || heartbeatFailed) return
        heartbeatBusy = true
        try {
            await updateOwnedJob({
                lease_expires_at: new Date(Date.now() + leaseSeconds * 1000).toISOString()
            })
        } catch (error) {
            heartbeatFailed = true
            console.error('[REEL FINALIZER HEARTBEAT ERROR]', error)
        } finally {
            heartbeatBusy = false
        }
    }, 45_000)

    const input = asRecord(job.input_payload)
    const session = asRecord(input.session)
    const media = asRecord(session.media)
    let resultPayload = asRecord(job.result_payload)
    const channelChatId = String(job.channel_chat_id || CHANEL_LINK)
    const mediaId = Number(job.media_id)
    const mediaType = job.media_type
    const contentType = job.content_type
    const isRichTypeCard = session.isRichTypeCard === true
    const currentMedia = session.currentMedia?.fileId
        ? session.currentMedia
        : {
            type: 'photo' as const,
            fileId: `https://image.tmdb.org/t/p/original${media.poster_path || media.backdrop_path}`
        }

    try {
        if (!mediaId || !mediaType || !contentType) {
            throw new Error('[REEL FINALIZER] Media metadata is incomplete in input_payload.session')
        }

        let channelMessageId = job.channel_message_id

        if (!channelMessageId) {
            const saveCount = await getMediaSaveCount(mediaId)
            const {caption} = await constructRichCard(undefined, {
                id: mediaId,
                type: mediaType,
                status: 'ready',
                contentType: contentType as ContentType,
                addComment: session.comment ?? undefined,
                addOverview: session.overview ?? undefined,
                keyTrailer: job.key_trailer,
                mediaOverride: currentMedia
            })

            const replyMarkup = keyboardSendMediaCardInline(
                mediaId,
                mediaType,
                contentType as any,
                media.genres,
                false,
                'channel',
                saveCount,
                job.key_trailer,
                isRichTypeCard
            )

            const publishedMessage = await telegramCallApi('sendRichMessage', {
                chat_id: channelChatId,
                rich_message: caption,
                reply_markup: replyMarkup
            })

            channelMessageId = Number(publishedMessage?.message_id)
            if (!Number.isSafeInteger(channelMessageId) || channelMessageId <= 0) {
                throw new Error('[REEL FINALIZER] Telegram sendRichMessage did not return message_id')
            }

            await updateOwnedJob({
                channel_chat_id: channelChatId,
                channel_message_id: channelMessageId,
                step: 'telegram_published'
            })
        }

        const {error: publishedMediaError} = await supabase
            .from('published_media_messages')
            .upsert({
                telegram_chat_id: channelChatId,
                telegram_message_id: channelMessageId,
                media_id: mediaId,
                media_type: mediaType,
                content_type: contentType,
                keyboard_version: CURRENT_KEYBOARD_VERSION,
                key_trailer: job.key_trailer,
                is_rich_type_card: isRichTypeCard
            }, {
                onConflict: 'telegram_chat_id,telegram_message_id'
            })

        if (publishedMediaError) {
            throw new Error(`[PUBLISHED MEDIA SAVE ERROR] ${publishedMediaError.message}`)
        }

        let instagramMediaId = job.instagram_media_id
        let instagramPermalink = job.instagram_permalink

        if (job.instagram_publish_r2_url && !instagramMediaId) {
            const instagramCaption = job.instagram_caption || createInstagramCaption({
                media,
                comment: session.comment ?? undefined,
                overview: session.overview ?? undefined,
                contentType
            })

            if (!job.instagram_caption) {
                await updateOwnedJob({instagram_caption: instagramCaption})
            }

            const existingContainerId = typeof resultPayload.instagramContainerId === 'string'
                ? resultPayload.instagramContainerId
                : undefined

            const instagram = await publishInstagramReel({
                videoUrl: job.instagram_publish_r2_url,
                caption: instagramCaption,
                existingContainerId,
                onContainerCreated: async (containerId) => {
                    resultPayload = {
                        ...resultPayload,
                        instagramContainerId: containerId
                    }
                    await updateOwnedJob({
                        result_payload: resultPayload,
                        step: 'instagram_container_created'
                    })
                },
                onPublished: async ({mediaId: publishedInstagramMediaId}) => {
                    await updateOwnedJob({
                        instagram_media_id: publishedInstagramMediaId,
                        step: 'instagram_published'
                    })
                }
            })

            instagramMediaId = instagram.mediaId
            instagramPermalink = instagram.permalink ?? null

            await updateOwnedJob({
                instagram_media_id: instagramMediaId,
                instagram_permalink: instagramPermalink,
                step: 'instagram_published'
            })
        }

        // Не даём ошибке обновления старой inline-кнопки отменить уже выполненную публикацию.
        if (session.inlineMessageId) {
            try {
                const saveCount = await getMediaSaveCount(mediaId)
                await bot.telegram.editMessageReplyMarkup(
                    undefined,
                    undefined,
                    session.inlineMessageId,
                    keyboardSendMediaCardInline(
                        mediaId,
                        mediaType,
                        contentType as any,
                        media.genres,
                        false,
                        'inline',
                        saveCount,
                        job.key_trailer,
                        isRichTypeCard
                    )
                )
            } catch (error: any) {
                if (error?.response?.description !== 'Bad Request: message is not modified') {
                    console.warn('[REEL FINALIZER INLINE KEYBOARD UPDATE ERROR]', error?.response?.description || error?.message || error)
                }
            }
        }

        await updateOwnedJob({
            status: 'published',
            step: instagramMediaId ? 'published' : 'published_telegram_only',

            // Ссылка на оформленный Reel больше не нужна после публикации.
            instagram_publish_r2_url: null,

            published_at: new Date().toISOString(),
            lease_token: null,
            lease_expires_at: null,
            last_error: null,
            failed_at: null
        })

        // Удаляем только ту сессию, которая породила этот job. Новую сессию админа
        // для другой карточки финализатор не трогает.
        try {
            const {data: user} = await supabase
                .from('users')
                .select('id')
                .eq('telegram_id', job.admin_telegram_id)
                .maybeSingle()

            if (user) {
                let deleteQuery = supabase
                    .from('card_edit_session')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('media_id', mediaId)
                    .eq('media_type', mediaType)
                    .eq('content_type', contentType)
                    .eq('key_trailer', job.key_trailer)
                    .eq('mode', 'publish')

                if (session.publishStartedAt != null) {
                    deleteQuery = deleteQuery.eq('publish_started_at', session.publishStartedAt)
                }

                const {error} = await deleteQuery
                if (error) console.error('[REEL FINALIZER SESSION CLEANUP ERROR]', error)
            }
        } catch (error) {
            console.error('[REEL FINALIZER SESSION CLEANUP ERROR]', error)
        }

        await sendAdminNotice(
            Number(job.admin_telegram_id),
            instagramMediaId
                ? 'Опубликовано в Telegram и Instagram'
                : 'Опубликовано в Telegram. Не удалось подготовить Reel для Instagram.'
        )

        console.log('[REEL FINALIZER PUBLISHED]', {
            jobId,
            channelMessageId,
            instagramMediaId,
            instagramPermalink
        })

        return {status: 'published'}
    } catch (error) {
        const message = getErrorMessage(error).slice(0, 12_000)
        console.error('[REEL FINALIZER FAILED]', {jobId, error: message})

        try {

            let publishReelDeleted = false

            if (job.instagram_publish_r2_url) {
                try {
                    await deleteCloudflareR2ObjectByUrl(
                        job.instagram_publish_r2_url
                    )

                    publishReelDeleted = true

                } catch (error) {
                    // Публикация уже завершена.
                    // Ошибка удаления не должна приводить к повторной публикации.
                    console.error('[R2 PUBLISHED REEL DELETE ERROR]', {
                        url: job.instagram_publish_r2_url,
                        error
                    })
                }
            }

            await updateOwnedJob({
                status: 'failed',
                last_error: message,
                failed_at: new Date().toISOString(),
                lease_token: null,
                lease_expires_at: null,
                instagram_publish_r2_url: publishReelDeleted
                    ? null
                    : job.instagram_publish_r2_url,
            })
        } catch (updateError) {
            console.error('[REEL FINALIZER FAILED-STATUS UPDATE ERROR]', updateError)
        }

        await resetAdminPublishLock(supabase, job)
        await sendAdminNotice(
            Number(job.admin_telegram_id),
            'Подготовка видео завершилась, но публикация не прошла полностью. Задача сохранена; повторное нажатие кнопки продолжит финализацию.'
        )

        throw error
    } finally {
        clearInterval(heartbeat)
    }
}

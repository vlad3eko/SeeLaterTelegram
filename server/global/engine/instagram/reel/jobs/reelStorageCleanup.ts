import {reelR2Paths} from "#server/global/engine/instagram/reel/pipeline/reelWorkspace"
import {getSupabase} from "#server/global/engine/instagram/reel/jobs/dispatchReelJob"

/**
 * Чистка временных файлов Reel в R2 (запрос владельца 11.11): `instagram/reels/temp/`
 * (исходник) и `instagram/reels/preview/` (лёгкая копия clean для Telegram) после
 * удачной публикации или отмены должны быть пустыми. Clean и готовый Reel не трогаются.
 *
 * Модуль R2 подключается при вызове: при загрузке он требует переменные R2, а этот файл
 * подключают обработчики кнопок бота.
 */

const loadR2 = () => import("#server/global/engine/instagram/reel/utils/storageCloudflareR2")

const TEMP_PREFIX = 'instagram/reels/temp/'
const PREVIEW_PREFIX = 'instagram/reels/preview/'

/** Объекты моложе этого не удаляются ежечасной чисткой: их может прямо сейчас писать воркер. */
const SWEEP_MIN_AGE_MS = 2 * 60 * 60 * 1000

type JobFiles = {
    mediaId: number | string
    mediaType: string
    keyTrailer: string
}

/**
 * Удалить превью и (если не `keepSource`) исходник одной задачи. Ошибки только в лог:
 * чистка не должна ломать публикацию или отмену.
 */
export const deleteReelTempFiles = async (
    job: JobFiles,
    {keepSource = false}: {keepSource?: boolean} = {}
): Promise<void> => {
    if (!job.keyTrailer) return

    const paths = reelR2Paths({id: Number(job.mediaId), type: job.mediaType}, job.keyTrailer)
    // Превью clean и превью фрагментов нарезки (до 8); несуществующие ключи R2 удаляет молча.
    const previews = [paths.preview, ...Array.from({length: 8}, (_, i) => paths.fragmentPreview(i + 1))]
    const keys = keepSource ? previews : [...previews, paths.source, paths.transcript]

    try {
        const {deleteFromCloudflareR2} = await loadR2()
        for (const key of keys) {
            await deleteFromCloudflareR2(key)
        }
        console.log('[REEL TEMP FILES DELETED]', {keys})
    } catch (error) {
        console.error('[REEL TEMP FILES DELETE ERROR]', {keys, error})
    }
}

// Задача ещё может понадобиться: в работе, ждёт проверки, публикуется или публикация
// упала на середине (финализатор продолжит).
const ACTIVE_STATUSES = new Set(['queued', 'processing', 'awaiting_review', 'ready', 'publishing'])
const RESUMABLE_FAILED_STEPS = new Set([
    'telegram_pending', 'telegram_published', 'instagram_container_created', 'instagram_published'
])

/**
 * Ежечасная чистка (эндпоинт expireReviews): из temp/ и preview/ удаляется всё, что не
 * принадлежит нужной задаче и старше SWEEP_MIN_AGE_MS. Исходник нарезки, у которой
 * Instagram не вышел (published_telegram_only), остаётся для повторной публикации.
 */
export const sweepReelTempFolders = async (
    supabase: ReturnType<typeof getSupabase> = getSupabase()
): Promise<{checked: number, deleted: string[], kept: number}> => {
    const {data, error} = await supabase
        .from('reel_processing_jobs')
        .select('media_id,media_type,key_trailer,status,step,input_payload')

    if (error) {
        throw new Error(`[REEL TEMP SWEEP] Job lookup failed: ${error.message}`)
    }

    const protectedKeys = new Set<string>()
    // Все превью задачи в работе (превью clean и фрагментов) — по общему началу ключа.
    const protectedPrefixes: string[] = []
    for (const job of (data ?? []) as Array<Record<string, any>>) {
        if (!job.key_trailer) continue
        const paths = reelR2Paths({id: Number(job.media_id), type: String(job.media_type)}, String(job.key_trailer))
        const isClip = job.input_payload?.videoType === 'clip'

        if (ACTIVE_STATUSES.has(job.status) || (job.status === 'failed' && RESUMABLE_FAILED_STEPS.has(job.step))) {
            protectedKeys.add(paths.source)
            protectedKeys.add(paths.transcript)
            protectedKeys.add(paths.preview)
            protectedPrefixes.push(paths.previewPrefix)
        } else if (isClip && job.step === 'published_telegram_only') {
            protectedKeys.add(paths.source)
            protectedKeys.add(paths.transcript)
        }
    }

    const {listCloudflareR2Objects, deleteFromCloudflareR2} = await loadR2()
    const objects = [
        ...await listCloudflareR2Objects(TEMP_PREFIX),
        ...await listCloudflareR2Objects(PREVIEW_PREFIX)
    ]

    const deleted: string[] = []
    let kept = 0
    const now = Date.now()

    for (const object of objects) {
        const tooFresh = now - object.lastModified.getTime() < SWEEP_MIN_AGE_MS
        const isProtected = protectedKeys.has(object.key) ||
            protectedPrefixes.some(prefix => object.key.startsWith(prefix))
        if (isProtected || tooFresh) {
            kept++
            continue
        }
        try {
            await deleteFromCloudflareR2(object.key)
            deleted.push(object.key)
        } catch (deleteError) {
            console.error('[REEL TEMP SWEEP DELETE ERROR]', {key: object.key, error: deleteError})
        }
    }

    console.log('[REEL TEMP SWEEP]', {checked: objects.length, deleted: deleted.length, kept})
    return {checked: objects.length, deleted, kept}
}

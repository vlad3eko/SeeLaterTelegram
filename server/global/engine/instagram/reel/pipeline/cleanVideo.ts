import os from "node:os"
import path from "node:path"
import {randomUUID} from "node:crypto"
import {unlink} from "node:fs/promises"
import {downloadTrailer} from "#server/global/engine/instagram/reel/utils/downloadTrailer"
import {
    isSquareReelVideo,
    prepareInstagramVideo,
    probeVideoDimensions
} from "#server/global/engine/instagram/reel/utils/prepareInstagramVideo"
import {
    deleteFromCloudflareR2,
    existsInCloudflareR2,
    getCloudflareR2Url,
    storageCloudflareR2
} from "#server/global/engine/instagram/reel/utils/storageCloudflareR2"
import {
    downloadR2ObjectToFile,
    reelR2Paths,
    type ReelContent,
    runReelStep,
    type ReelWorkspace
} from "#server/global/engine/instagram/reel/pipeline/reelWorkspace"

/**
 * Ссылка на файл R2 без кэша Cloudflare: clean и превью перезаписываются по тому же
 * ключу («Пересобрать»), а публичный домен R2 может отдавать прежнюю версию из кэша.
 * Параметр запроса делает адрес новым для кэша; на сам объект он не влияет.
 */
export const freshR2Url = (url: string, version: string | number = Date.now()): string =>
    /^https?:\/\//i.test(url)
        ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(version))}`
        : url

const localReelPath = (folder: string, name: string) =>
    path.join(os.tmpdir(), 'instagram', 'reels', folder, `${randomUUID()}_${name}`)

/**
 * Полный исходный трейлер. Если он уже лежит в R2 (ручная проверка: «Пересобрать»
 * после первой сборки), берётся оттуда, иначе скачивается с YouTube и кладётся в R2.
 */
export const obtainSourceVideo = async ({
    keyTrailer,
    content,
    workspace,
    reuseStoredSource
}: {
    keyTrailer: string
    content: ReelContent
    workspace: ReelWorkspace
    /** Искать исходник в R2 перед скачиванием (ручная ветка). */
    reuseStoredSource: boolean
}): Promise<string> => {
    const paths = reelR2Paths(content, keyTrailer)

    if (reuseStoredSource) {
        const stored = await runReelStep(
            'CHECK_SOURCE_IN_R2',
            () => existsInCloudflareR2(paths.source)
        )

        if (stored) {
            const localPath = localReelPath('source', `${keyTrailer}.mp4`)
            workspace.trackFile(localPath)

            try {
                await runReelStep(
                    'DOWNLOAD_SOURCE_FROM_R2',
                    () => downloadR2ObjectToFile(freshR2Url(getCloudflareR2Url(paths.source)), localPath)
                )
                console.log('[REEL SOURCE FROM R2]', paths.source)
                return localPath
            } catch (error) {
                // Исходник в R2 недоступен: качаем заново, это дольше, но результат тот же.
                console.warn('[REEL SOURCE FROM R2 FAILED] Downloading the trailer again', {
                    message: error instanceof Error ? error.message : String(error)
                })
                await unlink(localPath).catch(() => undefined)
            }
        }
    }

    const sourcePath = await runReelStep(
        'DOWNLOAD_TRAILER',
        () => downloadTrailer(keyTrailer)
    )
    workspace.trackFile(sourcePath)

    await runReelStep(
        'UPLOAD_SOURCE_TO_R2',
        () => storageCloudflareR2(sourcePath, paths.source)
    )

    return sourcePath
}

export const deleteStoredSource = async (
    content: Pick<ReelContent, 'id' | 'type'>,
    keyTrailer: string
): Promise<void> => {
    const sourceR2Path = reelR2Paths(content, keyTrailer).source

    try {
        await deleteFromCloudflareR2(sourceR2Path)
        console.log('[R2 SOURCE DELETED]', sourceR2Path)
    } catch (error) {
        console.error('[R2 SOURCE DELETE ERROR]', error)
    }
}

export type CleanVideo = {
    /** Локальный файл clean 1080×1080 (удаляется вместе с workspace). */
    path: string
    /** Публичная ссылка R2 (без параметра версии). */
    r2Url: string
    /** Clean взят из кэша R2, а не собран в этом запуске. */
    fromCache: boolean
    /** Исходник скачивался или загружался в R2 в этом запуске. */
    sourceTouched: boolean
}

/**
 * Clean-видео 1080×1080 для Reel.
 *
 * - `reuseCache`: если clean этого фильма и ключа уже в R2 и он квадратный, берётся он
 *   (так было всегда). «Пересобрать» передаёт false: clean собирается заново.
 * - `segmentVariant`: какой фрагмент трейлера брать (0 — прежний).
 * - `reuseStoredSource`: исходник сначала ищется в R2 (ручная ветка).
 */
export const obtainCleanVideo = async ({
    keyTrailer,
    content,
    workspace,
    reuseCache,
    segmentVariant,
    reuseStoredSource,
    framing = 'center'
}: {
    keyTrailer: string
    content: ReelContent
    workspace: ReelWorkspace
    reuseCache: boolean
    segmentVariant: number
    reuseStoredSource: boolean
    /** center — трейлер (квадрат по центру); track — нарезка (следить за лицом по X). */
    framing?: 'center' | 'track'
}): Promise<CleanVideo> => {
    const paths = reelR2Paths(content, keyTrailer)

    if (reuseCache) {
        const cached = await downloadCachedClean({keyTrailer, content, workspace})
        if (cached) return cached
    }

    // Clean-кэша нет, он в старом макете или нужен новый вариант: собираем из исходника.
    const sourcePath = await obtainSourceVideo({keyTrailer, content, workspace, reuseStoredSource})

    // На входе полный исходный трейлер, clean собирается одним проходом FFmpeg.
    const cleanPath = await runReelStep(
        'PREPARE_INSTAGRAM_VIDEO',
        () => prepareInstagramVideo(sourcePath, keyTrailer, {segmentVariant, framing})
    )
    workspace.trackFile(cleanPath)

    // storageCloudflareR2 возвращает публичную ссылку.
    const r2Url = await runReelStep(
        'UPLOAD_CLEAN_VIDEO_TO_R2',
        () => storageCloudflareR2(cleanPath, paths.clean)
    )

    console.log('[REEL CLEAN VIDEO SAVED]', {r2Url, segmentVariant, framing})

    return {path: cleanPath, r2Url, fromCache: false, sourceTouched: true}
}

/**
 * Clean из R2, если он есть и в нынешнем квадратном макете 1080×1080. Старый clean
 * 1080×1920 не годится: возвращается undefined, и его пересобирают по тому же пути.
 */
export const downloadCachedClean = async ({
    keyTrailer,
    content,
    workspace,
    requireCache = false
}: {
    keyTrailer: string
    content: ReelContent
    workspace: ReelWorkspace
    /** Фазы hooks и finish: clean обязан быть, его отсутствие это ошибка. */
    requireCache?: boolean
}): Promise<CleanVideo | undefined> => {
    const paths = reelR2Paths(content, keyTrailer)

    const exists = await runReelStep(
        'CHECK_CLEAN_VIDEO_CACHE',
        () => existsInCloudflareR2(paths.clean)
    )

    if (!exists) {
        if (requireCache) {
            throw new Error(`[REEL CLEAN] Clean video is missing in R2: ${paths.clean}`)
        }
        return undefined
    }

    console.log('[REEL CLEAN CACHE HIT]', paths.clean)

    const r2Url = getCloudflareR2Url(paths.clean)
    const localPath = localReelPath('clean', `${content.id}_${content.type}_${keyTrailer}_clean.mp4`)
    workspace.trackFile(localPath)

    await runReelStep(
        'DOWNLOAD_CLEAN_VIDEO_FROM_R2',
        // Свежая версия: после «Пересобрать» объект по этому ключу уже другой.
        () => downloadR2ObjectToFile(freshR2Url(r2Url), localPath)
    )

    const layout = await runReelStep(
        'CHECK_CLEAN_LAYOUT',
        async () => {
            try {
                return await probeVideoDimensions(localPath)
            } catch (error) {
                console.warn('[REEL CLEAN LAYOUT] Could not read the cached clean size', error)
                return undefined
            }
        }
    )

    if (!layout || !isSquareReelVideo(layout)) {
        console.log('[REEL CLEAN CACHE STALE LAYOUT] Rebuilding clean 1080x1080', {
            cleanR2Path: paths.clean,
            cachedLayout: layout ? `${layout.width}x${layout.height}` : 'unknown'
        })

        await unlink(localPath).catch(() => undefined)

        if (requireCache) {
            throw new Error(`[REEL CLEAN] Clean video in R2 is not ${'1080x1080'}: ${paths.clean}`)
        }
        return undefined
    }

    return {path: localPath, r2Url, fromCache: true, sourceTouched: false}
}

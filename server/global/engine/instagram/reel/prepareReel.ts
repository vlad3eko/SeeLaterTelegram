import {downloadTrailer} from "#server/global/engine/instagram/reel/utils/downloadTrailer"
import {isYouTubeVideoId} from "#server/global/engine/instagram/reel/utils/extractYouTubeVideoId"
import {copyFile, mkdir, rm, stat, unlink, writeFile} from "node:fs/promises"
import {
    getInputVideoDuration,
    isSquareReelVideo,
    prepareInstagramVideo,
    probeVideoDimensions
} from "#server/global/engine/instagram/reel/utils/prepareInstagramVideo"
import {decorateInstagramVideo} from "#server/global/engine/instagram/reel/utils/decorateInstagramVideo"
import {
    deleteFromCloudflareR2,
    existsInCloudflareR2,
    getCloudflareR2Url,
    storageCloudflareR2
} from "#server/global/engine/instagram/reel/utils/storageCloudflareR2"
import path from "node:path"
import os from "node:os"
import {fileURLToPath} from "node:url"
import {
    generateInstagramHookFromVideo
} from "#server/global/engine/instagram/reel/utils/generateInstagramHookFromVideo"
import {randomUUID} from "node:crypto";
import {prepareInstagramSubtitleTrack, prepareSaveCtaTrack} from "#server/global/engine/instagram/reel/subtitle";


type PrepareReelOptions = {
    onHookGenerated?: (hook: string) => Promise<void> | void
    generateSubtitles?: boolean
    keepSubtitleDebugArtifacts?: boolean
    /**
     * Вызывается сразу после сборки дорожки субтитров, до удаления её рабочей папки.
     * Сухой прогон забирает отсюда транскрипт для проверки глазами. Сбой колбэка
     * на сборку Reel не влияет.
     */
    onSubtitleTrackReady?: (track: {
        workDirectory: string
        assPath: string
        wordCount: number
        blockCount: number
    }) => Promise<void> | void
}

const runReelStep = async <T>(
    name: string,
    action: () => Promise<T>
): Promise<T> => {
    const startedAt = Date.now()

    console.log(`[REEL STEP START] ${name}`)

    try {
        const result = await action()

        console.log(`[REEL STEP DONE] ${name}`, {
            durationMs: Date.now() - startedAt
        })

        return result
    } catch (error) {
        console.error(`[REEL STEP ERROR] ${name}`, {
            durationMs: Date.now() - startedAt,
            error
        })

        throw error
    }
}


const downloadR2ObjectToFile = async (
    url: string,
    outputPath: string
): Promise<void> => {
    if (!url) {
        throw new Error('[R2 CLEAN CACHE] URL is missing')
    }

    // Локальный режим разработки (REEL_LOCAL_STORAGE_DIR): «ссылка» вида file:///..., читаем с диска.
    if (url.startsWith('file:')) {
        const localPath = fileURLToPath(url)
        const sizeBytes = (await stat(localPath)).size

        if (sizeBytes === 0) {
            throw new Error('[R2 CLEAN CACHE] Local file is empty')
        }

        await mkdir(path.dirname(outputPath), {recursive: true})
        await copyFile(localPath, outputPath)

        console.log('[R2 CLEAN CACHE DOWNLOADED]', {
            outputPath,
            sizeBytes,
            source: 'local'
        })

        return
    }

    const response = await fetch(url)

    if (!response.ok) {
        throw new Error(
            `[R2 CLEAN CACHE] Download failed: HTTP ${response.status}`
        )
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    if (buffer.length === 0) {
        throw new Error('[R2 CLEAN CACHE] Downloaded file is empty')
    }

    await mkdir(path.dirname(outputPath), {recursive: true})
    await writeFile(outputPath, buffer)

    console.log('[R2 CLEAN CACHE DOWNLOADED]', {
        outputPath,
        sizeBytes: buffer.length
    })
}


export const prepareReel = async (
    keyTrailer: string,
    hook: string,
    content: {
        id: number
        type: string
        title?: string
        overview?: string
        genre?: string | Array<{
            id?: number
            name?: string
        } | string>
        rating?: number | string
    },
    options: PrepareReelOptions = {},
) => {

    const keepSubtitleDebugArtifacts =
        options.keepSubtitleDebugArtifacts ??
        (process.env.KEEP_SUBTITLE_DEBUG_ARTIFACTS === 'true')

    if (!keyTrailer) {
        throw new Error('Trailer key is missing')
    }

    if (!isYouTubeVideoId(keyTrailer)) {
        throw new Error('Trailer key is not a valid YouTube video id')
    }

    const sourceR2Path =
        `instagram/reels/temp/${content.id}_${content.type}_${keyTrailer}.mp4`

    const reelR2Path =
        `instagram/reels/reel/${content.id}_${content.type}_${keyTrailer}_reel.mp4`

    const cleanR2Path =
        `instagram/reels/clean/${content.id}_${content.type}_${keyTrailer}_clean.mp4`


    // Состояние одного запуска. Раньше эти две переменные лежали на уровне модуля: в долгоживущем
    // процессе (админ-бот) следующий запуск подхватывал путь к уже удалённому ASS предыдущего.
    let subtitleAssPath: string | undefined
    let subtitleWorkDirectory: string | undefined

    let sourcePath: string | undefined
    let preparedInstagramPath: string | undefined
    let reelPath: string | undefined

    let cleanR2: string | undefined

    let sourceR2CleanupNeeded = false

    // Окна с репликами из субтитров: по ним «Сохрани…» выбирает тихое место.
    let speechWindows: Array<{ start: number, end: number }> | undefined
    let ctaAssPath: string | undefined
    let ctaWorkDirectory: string | undefined


    try {
        const cleanCacheExists = await runReelStep(
            'CHECK_CLEAN_VIDEO_CACHE',
            () => existsInCloudflareR2(cleanR2Path)
        )

        // Reel всегда собирается заново из clean (или из исходника): так обновляются хук и оформление.
        // Из кэша берётся только clean.
        //
        // Кэш clean годится, только если он в нынешнем квадратном макете 1080x1080.
        // Старый clean 1080x1920 пересобираем из исходника и пишем по тому же
        // пути R2: ключи не меняются, кэш не сбрасываем.
        let cleanCacheUsable = cleanCacheExists

        if (cleanCacheExists) {
            console.log('[REEL CLEAN CACHE HIT]', cleanR2Path)

            cleanR2 = getCloudflareR2Url(cleanR2Path)

            // Восстанавливаем clean из R2.
            preparedInstagramPath = path.join(
                os.tmpdir(),
                'instagram',
                'reels',
                'clean',
                `${content.id}_${content.type}_${keyTrailer}_clean.mp4`
            )

            await runReelStep(
                'DOWNLOAD_CLEAN_VIDEO_FROM_R2',
                () => downloadR2ObjectToFile(
                    cleanR2!,
                    preparedInstagramPath!
                )
            )

            const cachedLayout = await runReelStep(
                'CHECK_CLEAN_LAYOUT',
                async () => {
                    try {
                        return await probeVideoDimensions(preparedInstagramPath!)
                    } catch (error) {
                        console.warn('[REEL CLEAN LAYOUT] Could not read the cached clean size', error)
                        return undefined
                    }
                }
            )

            if (!cachedLayout || !isSquareReelVideo(cachedLayout)) {
                console.log('[REEL CLEAN CACHE STALE LAYOUT] Rebuilding clean 1080x1080', {
                    cleanR2Path,
                    cachedLayout: cachedLayout
                        ? `${cachedLayout.width}x${cachedLayout.height}`
                        : 'unknown'
                })

                await unlink(preparedInstagramPath!).catch(() => undefined)
                preparedInstagramPath = undefined
                cleanCacheUsable = false
            }
        }

        if (!cleanCacheUsable) {
            // Clean-кэша нет или он в старом макете — собираем из исходного трейлера.
            sourcePath = await runReelStep(
                'DOWNLOAD_TRAILER',
                () => downloadTrailer(keyTrailer)
            )

            sourceR2CleanupNeeded = true

            await runReelStep(
                'UPLOAD_SOURCE_TO_R2',
                () => storageCloudflareR2(sourcePath!, sourceR2Path)
            )

            // На входе полный исходный трейлер.
            // Создание clean выполняется одним проходом FFmpeg.
            preparedInstagramPath = await runReelStep(
                'PREPARE_INSTAGRAM_VIDEO',
                () => prepareInstagramVideo(sourcePath!, keyTrailer)
            )

            // storageCloudflareR2 уже возвращает публичную ссылку.
            cleanR2 = await runReelStep(
                'UPLOAD_CLEAN_VIDEO_TO_R2',
                () => storageCloudflareR2(
                    preparedInstagramPath!,
                    cleanR2Path
                )
            )

            console.log('[REEL CLEAN VIDEO SAVED]', cleanR2)
        }


        // Gemini генерирует новый хук на основе clean-видео.
        let generatedHook: string | undefined

        const finalHook = await runReelStep(
            'GENERATE_INSTAGRAM_HOOK_FROM_VIDEO',
            async () => {
                try {
                    const result = await generateInstagramHookFromVideo(
                        preparedInstagramPath!,
                        {
                            title: content.title,
                            overview: content.overview,
                            genre: content.genre
                        }
                    )

                    const normalizedHook = String(result ?? '').trim()

                    if (!normalizedHook) {
                        throw new Error('[GEMINI] Generated hook is empty')
                    }

                    generatedHook = normalizedHook

                    return normalizedHook

                } catch (error) {
                    const geminiError = error instanceof Error
                        ? error as Error & {
                            code?: unknown
                            status?: unknown
                            statusCode?: unknown
                        }
                        : undefined

                    console.error('[GEMINI HOOK ERROR]', {
                        name: error instanceof Error ? error.name : typeof error,
                        message: error instanceof Error ? error.message : String(error),
                        code: geminiError?.code,
                        status: geminiError?.status ?? geminiError?.statusCode,
                        stack: error instanceof Error ? error.stack : undefined
                    })

                    // При ошибке Gemini используем исходный хук.
                    if (hook?.trim()) {
                        console.warn('[GEMINI] Using fallback hook:', hook)

                        return hook.trim()
                    }

                    throw error
                }
            }
        )


        // Сохраняем хук в Supabase только после успешного ответа Gemini.
        // Callback находится за пределами Gemini try/catch:
        // ошибка записи в БД не должна превращаться в fallback.
        const hookToSave = generatedHook
        const onHookGenerated = options.onHookGenerated

        if (hookToSave && onHookGenerated) {
            await runReelStep(
                'SAVE_GEMINI_HOOK_TO_JOB',
                () => Promise.resolve(onHookGenerated(hookToSave))
            )
        }

        // ================================================
        // GENERATE DYNAMIC INSTAGRAM SUBTITLES
        // ================================================

        const shouldGenerateSubtitles =
            options.generateSubtitles ??
            (process.env.REEL_SUBTITLES_ENABLED === 'true')

        if (shouldGenerateSubtitles) {

            const subtitleRunId = `${content.id}_${randomUUID()}`

            const subtitleRootDirectory = path.join(
                os.tmpdir(),
                'instagram',
                'reels',
                'subtitles'
            )

            // Заранее запоминаем папку для гарантированной очистки,
            // даже если Whisper завершится ошибкой.
            subtitleWorkDirectory = path.join(
                subtitleRootDirectory,
                subtitleRunId
            )

            try {

                const subtitleTrack = await runReelStep(
                    'GENERATE_INSTAGRAM_SUBTITLES',
                    () => prepareInstagramSubtitleTrack({

                        inputVideoPath: preparedInstagramPath!,

                        workDirectory: subtitleRootDirectory,

                        runId: subtitleRunId,

                        modelPath: process.env.WHISPER_MODEL_PATH,

                        // Отдельная сборка FFmpeg с Whisper.
                        // Не используем ffmpeg-static из декоратора.
                        whisperFfmpegPath:
                        process.env.WHISPER_FFMPEG_PATH,

                        ffprobePath:
                        process.env.FFPROBE_PATH,

                        language: 'ru',

                        // Название и описание помогают проверке транскрипта
                        // с именами и темой ролика.
                        context: {
                            title: content.title,
                            overview: content.overview,
                        },

                        queueSeconds: 10,

                        useGpu: false,

                        // Оставляем только готовый ASS.
                        keepDebugArtifacts: keepSubtitleDebugArtifacts ?? false,
                    })
                )

                subtitleAssPath = subtitleTrack.assPath
                speechWindows = subtitleTrack.speechWindows

                console.log('[SUBTITLE TRACK READY]', {
                    assPath: subtitleAssPath,
                    wordCount: subtitleTrack.wordCount,
                    blockCount: subtitleTrack.blockCount,
                    durationSeconds: subtitleTrack.durationSeconds
                })

                if (options.onSubtitleTrackReady) {
                    try {
                        await options.onSubtitleTrackReady({
                            workDirectory: subtitleTrack.workDirectory,
                            assPath: subtitleTrack.assPath,
                            wordCount: subtitleTrack.wordCount,
                            blockCount: subtitleTrack.blockCount
                        })
                    } catch (callbackError) {
                        console.warn(
                            '[SUBTITLE] onSubtitleTrackReady failed; the reel continues',
                            callbackError instanceof Error
                                ? callbackError.message
                                : String(callbackError)
                        )
                    }
                }

            } catch (error) {

                // Субтитры необязательны.
                // Ошибка распознавания не должна останавливать Reel pipeline.

                subtitleAssPath = undefined

                console.warn(
                    '[SUBTITLE GENERATION FAILED] Continuing without subtitles',
                    {
                        message: error instanceof Error
                            ? error.message
                            : String(error)
                    }
                )
            }

        }


        // ================================================
        // «СОХРАНИ, ЧТОБЫ НЕ ПОТЕРЯТЬ» ВНИЗУ КАДРА
        // ================================================
        // Эффект субтитров, середина и конец ролика. Не зависит от Whisper.
        // Призыв необязателен: при ошибке ролик выходит без него.
        try {
            const cleanDurationSeconds = await getInputVideoDuration(preparedInstagramPath!)

            const ctaTrack = await runReelStep(
                'GENERATE_SAVE_CTA',
                () => prepareSaveCtaTrack({
                    videoPath: preparedInstagramPath!,
                    durationSeconds: cleanDurationSeconds,
                    workDirectory: path.join(os.tmpdir(), 'instagram', 'reels', 'cta'),
                    runId: `${content.id}_${randomUUID()}`,
                    speechWindows
                })
            )

            ctaAssPath = ctaTrack.assPath
            ctaWorkDirectory = path.dirname(ctaTrack.assPath)

        } catch (error) {
            ctaAssPath = undefined

            console.warn(
                '[SAVE CTA FAILED] Continuing without the call to save',
                {
                    message: error instanceof Error
                        ? error.message
                        : String(error)
                }
            )
        }


        reelPath = await runReelStep(
            'DECORATE_INSTAGRAM_VIDEO',
            () => decorateInstagramVideo(
                preparedInstagramPath!,
                keyTrailer,
                finalHook,
                {
                    subtitleAssPath,
                    ctaAssPath
                }
            )
        )


        const reelR2 = await runReelStep(
            'UPLOAD_FINAL_REEL_TO_R2',
            () => storageCloudflareR2(reelPath!, reelR2Path)
        )

        return {
            cleanR2,
            reelR2
        }

    } finally {

        if (subtitleWorkDirectory && !keepSubtitleDebugArtifacts) {
            await rm(subtitleWorkDirectory, {
                recursive: true,
                force: true
            }).catch(error => {
                console.error('[SUBTITLE TEMP CLEANUP ERROR]', error)
            })
        }

        if (ctaWorkDirectory) {
            await rm(ctaWorkDirectory, {
                recursive: true,
                force: true
            }).catch(error => {
                console.error('[SAVE CTA TEMP CLEANUP ERROR]', error)
            })
        }

        if (sourceR2CleanupNeeded) {
            try {
                await deleteFromCloudflareR2(sourceR2Path)

                console.log('[R2 SOURCE DELETED]', sourceR2Path)

            } catch (error) {
                console.error('[R2 SOURCE DELETE ERROR]', error)
            }
        }


        const temporaryFiles = [
            sourcePath,
            preparedInstagramPath,
            reelPath
        ]

        for (const filePath of new Set(temporaryFiles)) {
            if (!filePath) {
                continue
            }

            try {
                await unlink(filePath)

                console.log('[LOCAL TEMP DELETE]', filePath)

            } catch (error: any) {
                if (error?.code !== 'ENOENT') {
                    console.error('[LOCAL TEMP DELETE ERROR]', filePath, error)
                }
            }
        }

        if (subtitleWorkDirectory) {
            try {
                await rm(subtitleWorkDirectory, {
                    recursive: true,
                    force: true
                })

                console.log(
                    '[SUBTITLE TEMP CLEANUP]',
                    subtitleWorkDirectory
                )

            } catch (error) {

                console.error(
                    '[SUBTITLE TEMP CLEANUP ERROR]',
                    subtitleWorkDirectory,
                    error
                )
            }
        }
    }
}

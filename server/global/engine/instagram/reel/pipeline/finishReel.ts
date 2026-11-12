import os from "node:os"
import path from "node:path"
import {randomUUID} from "node:crypto"
import {getInputVideoDuration} from "#server/global/engine/instagram/reel/utils/prepareInstagramVideo"
import {decorateInstagramVideo} from "#server/global/engine/instagram/reel/utils/decorateInstagramVideo"
import {storageCloudflareR2} from "#server/global/engine/instagram/reel/utils/storageCloudflareR2"
import {
    generateInstagramHookFromVideo,
    generateInstagramHookOptionsFromVideo
} from "#server/global/engine/instagram/reel/utils/generateInstagramHookFromVideo"
import {prepareInstagramSubtitleTrack, prepareSaveCtaTrack} from "#server/global/engine/instagram/reel/subtitle"
import {
    reelR2Paths,
    type ReelContent,
    runReelStep,
    type ReelWorkspace
} from "#server/global/engine/instagram/reel/pipeline/reelWorkspace"
import {loadSourceTranscript, wordsForSegment} from "#server/global/engine/instagram/reel/fragments/sourceTranscript"

const hookContext = (content: ReelContent) => ({
    title: content.title,
    overview: content.overview,
    genre: content.genre
})

const describeGeminiError = (error: unknown) => {
    const geminiError = error instanceof Error
        ? error as Error & {code?: unknown, status?: unknown, statusCode?: unknown}
        : undefined

    return {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        code: geminiError?.code,
        status: geminiError?.status ?? geminiError?.statusCode,
        stack: error instanceof Error ? error.stack : undefined
    }
}

/**
 * Один хук от Gemini по clean (ветка без проверки и истёкшая проверка).
 * При ошибке Gemini берётся шаблонный `fallbackHook`. `generated` заполнен, только
 * если хук написал Gemini: его сохраняют в задачу.
 */
export const resolveAutomaticHook = async ({
    cleanPath,
    content,
    fallbackHook
}: {
    cleanPath: string
    content: ReelContent
    fallbackHook: string
}): Promise<{hook: string, generated?: string}> =>
    runReelStep('GENERATE_INSTAGRAM_HOOK_FROM_VIDEO', async () => {
        try {
            const result = String(
                await generateInstagramHookFromVideo(cleanPath, hookContext(content)) ?? ''
            ).trim()

            if (!result) {
                throw new Error('[GEMINI] Generated hook is empty')
            }

            return {hook: result, generated: result}

        } catch (error) {
            console.error('[GEMINI HOOK ERROR]', describeGeminiError(error))

            // При ошибке Gemini используем исходный (шаблонный) хук.
            if (fallbackHook?.trim()) {
                console.warn('[GEMINI] Using fallback hook:', fallbackHook)
                return {hook: fallbackHook.trim()}
            }

            throw error
        }
    })

/**
 * Варианты хука для выбора администратором (фаза `hooks`). Ошибка Gemini здесь не
 * заменяется шаблоном: администратор увидит сообщение об ошибке и сможет нажать ещё раз.
 */
export const generateHookOptions = async ({
    cleanPath,
    content
}: {
    cleanPath: string
    content: ReelContent
}): Promise<string[]> =>
    runReelStep('GENERATE_INSTAGRAM_HOOK_OPTIONS', async () => {
        const options = (await generateInstagramHookOptionsFromVideo(cleanPath, hookContext(content)))
            .map(option => option.trim())
            .filter(Boolean)

        if (!options.length) {
            throw new Error('[GEMINI] No usable hook options')
        }

        console.log('[GEMINI HOOK OPTIONS]', {options})

        return options
    })

export type FinishReelOptions = {
    /**
     * Нарезка: фрагмент исходника, из которого собран clean. Субтитры берут слова этого
     * фрагмента из сохранённой расшифровки исходника (без второго запроса к Gemini).
     */
    segment?: {startSeconds: number, endSeconds: number}
    generateSubtitles?: boolean
    keepSubtitleDebugArtifacts?: boolean
    onSubtitleTrackReady?: (track: {
        workDirectory: string
        assPath: string
        wordCount: number
        blockCount: number
    }) => Promise<void> | void
}

/**
 * Финальный ролик из clean и готового хука: субтитры, «Сохрани…», оформление,
 * загрузка в R2. Возвращает публичную ссылку на Reel.
 */
export const finishReel = async ({
    cleanPath,
    keyTrailer,
    content,
    hook,
    workspace,
    options = {}
}: {
    cleanPath: string
    keyTrailer: string
    content: ReelContent
    hook: string
    workspace: ReelWorkspace
    options?: FinishReelOptions
}): Promise<string> => {
    const keepSubtitleDebugArtifacts =
        options.keepSubtitleDebugArtifacts ??
        (process.env.KEEP_SUBTITLE_DEBUG_ARTIFACTS === 'true')

    let subtitleAssPath: string | undefined

    // Окна с репликами из субтитров: по ним «Сохрани…» выбирает тихое место.
    let speechWindows: Array<{ start: number, end: number }> | undefined

    // ================================================
    // DYNAMIC INSTAGRAM SUBTITLES
    // ================================================

    const shouldGenerateSubtitles =
        options.generateSubtitles ??
        (process.env.REEL_SUBTITLES_ENABLED === 'true')

    if (shouldGenerateSubtitles) {
        const subtitleRunId = `${content.id}_${randomUUID()}`
        const subtitleRootDirectory = path.join(os.tmpdir(), 'instagram', 'reels', 'subtitles')

        // Заранее запоминаем папку для гарантированной очистки, даже если Whisper упадёт.
        workspace.trackDirectory(path.join(subtitleRootDirectory, subtitleRunId))

        try {
            // Слова фрагмента из расшифровки исходника (шаг выбора фрагментов), если есть.
            const stored = options.segment ? await loadSourceTranscript(content, keyTrailer) : null
            const preTranscribed = stored && options.segment ? wordsForSegment(stored.words, options.segment) : undefined

            const subtitleTrack = await runReelStep(
                'GENERATE_INSTAGRAM_SUBTITLES',
                () => prepareInstagramSubtitleTrack({
                    inputVideoPath: cleanPath,
                    workDirectory: subtitleRootDirectory,
                    runId: subtitleRunId,
                    modelPath: process.env.WHISPER_MODEL_PATH,

                    // Отдельная сборка FFmpeg с Whisper, не ffmpeg-static из декоратора.
                    whisperFfmpegPath: process.env.WHISPER_FFMPEG_PATH,
                    ffprobePath: process.env.FFPROBE_PATH,

                    language: 'ru',

                    // Название и описание помогают проверке транскрипта с именами и темой ролика.
                    context: {
                        title: content.title,
                        overview: content.overview,
                    },

                    queueSeconds: 10,
                    useGpu: false,

                    // Оставляем только готовый ASS.
                    keepDebugArtifacts: keepSubtitleDebugArtifacts ?? false,
                    ...(preTranscribed?.length ? {preTranscribed} : {}),
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
                        callbackError instanceof Error ? callbackError.message : String(callbackError)
                    )
                }
            }

        } catch (error) {
            // Субтитры необязательны: ошибка распознавания не останавливает Reel.
            subtitleAssPath = undefined

            console.warn('[SUBTITLE GENERATION FAILED] Continuing without subtitles', {
                message: error instanceof Error ? error.message : String(error)
            })
        }
    }

    // ================================================
    // «СОХРАНИ, ЧТОБЫ НЕ ПОТЕРЯТЬ» ВНИЗУ КАДРА
    // ================================================
    // Эффект субтитров, середина и конец ролика. Не зависит от Whisper.
    // Призыв необязателен: при ошибке ролик выходит без него.
    let ctaAssPath: string | undefined

    try {
        const cleanDurationSeconds = await getInputVideoDuration(cleanPath)

        const ctaTrack = await runReelStep(
            'GENERATE_SAVE_CTA',
            () => prepareSaveCtaTrack({
                videoPath: cleanPath,
                durationSeconds: cleanDurationSeconds,
                workDirectory: path.join(os.tmpdir(), 'instagram', 'reels', 'cta'),
                runId: `${content.id}_${randomUUID()}`,
                speechWindows
            })
        )

        ctaAssPath = ctaTrack.assPath
        workspace.trackDirectory(path.dirname(ctaTrack.assPath))

    } catch (error) {
        ctaAssPath = undefined

        console.warn('[SAVE CTA FAILED] Continuing without the call to save', {
            message: error instanceof Error ? error.message : String(error)
        })
    }

    const reelPath = await runReelStep(
        'DECORATE_INSTAGRAM_VIDEO',
        () => decorateInstagramVideo(
            cleanPath,
            keyTrailer,
            hook,
            {
                subtitleAssPath,
                ctaAssPath
            }
        )
    )
    workspace.trackFile(reelPath)

    return runReelStep(
        'UPLOAD_FINAL_REEL_TO_R2',
        () => storageCloudflareR2(reelPath, reelR2Paths(content, keyTrailer).reel)
    )
}

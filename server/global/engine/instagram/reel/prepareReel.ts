import {isYouTubeVideoId} from "#server/global/engine/instagram/reel/utils/extractYouTubeVideoId"
import {ReelWorkspace, type ReelContent, runReelStep} from "#server/global/engine/instagram/reel/pipeline/reelWorkspace"
import {
    deleteStoredSource,
    downloadCachedClean,
    freshR2Url,
    obtainCleanVideo
} from "#server/global/engine/instagram/reel/pipeline/cleanVideo"
import {createCleanPreview} from "#server/global/engine/instagram/reel/pipeline/previewVideo"
import {
    finishReel,
    type FinishReelOptions,
    generateHookOptions,
    resolveAutomaticHook
} from "#server/global/engine/instagram/reel/pipeline/finishReel"

/**
 * Сборка Reel. Две ветки (см. TASKS.md, «Проверка Reel перед публикацией»):
 *
 * - `prepareReel`: всё за один проход, хук выбирает Gemini (публикация без проверки,
 *   сухой прогон). Поведение прежнее.
 * - Ручная проверка, по фазам, каждая отдельным запуском воркера:
 *   `prepareReelCleanPhase` (clean + превью) → `prepareReelHookOptionsPhase` (4 хука) →
 *   `finishReelPhase` (выбранный хук или, если время выбора истекло, хук от Gemini).
 */

type PrepareReelOptions = FinishReelOptions & {
    onHookGenerated?: (hook: string) => Promise<void> | void
    /** Нарезка без администратора (истёк выбор фрагмента): фрагмент и слежение за лицом. */
    segment?: {startSeconds: number, endSeconds: number}
    framing?: 'center' | 'track'
}

const assertTrailerKey = (keyTrailer: string) => {
    if (!keyTrailer) {
        throw new Error('Trailer key is missing')
    }

    if (!isYouTubeVideoId(keyTrailer)) {
        throw new Error('Trailer key is not a valid YouTube video id')
    }
}

const saveGeneratedHook = async (
    generated: string | undefined,
    onHookGenerated: PrepareReelOptions['onHookGenerated']
) => {
    // Сохраняем хук только после успешного ответа Gemini. Колбэк за пределами
    // try/catch Gemini: ошибка записи в БД не должна превращаться в шаблонный хук.
    if (generated && onHookGenerated) {
        await runReelStep(
            'SAVE_GEMINI_HOOK_TO_JOB',
            () => Promise.resolve(onHookGenerated(generated))
        )
    }
}

export const prepareReel = async (
    keyTrailer: string,
    hook: string,
    content: ReelContent,
    options: PrepareReelOptions = {},
) => {
    assertTrailerKey(keyTrailer)

    const workspace = new ReelWorkspace()
    let sourceTouched = false

    try {
        // Reel всегда собирается заново из clean (так обновляются хук и оформление).
        // Из кэша берётся только clean в нынешнем квадратном макете.
        const clean = await obtainCleanVideo({
            keyTrailer,
            content,
            workspace,
            // Выбранный фрагмент или слежение — свой clean, кэш по центру не годится.
            reuseCache: !options.segment && (options.framing ?? 'center') === 'center',
            segmentVariant: 0,
            reuseStoredSource: Boolean(options.segment),
            framing: options.framing ?? 'center',
            segment: options.segment
        })
        sourceTouched = clean.sourceTouched

        // Gemini генерирует новый хук по clean-видео.
        const {hook: finalHook, generated} = await resolveAutomaticHook({
            cleanPath: clean.path,
            content,
            fallbackHook: hook
        })
        await saveGeneratedHook(generated, options.onHookGenerated)

        const reelR2 = await finishReel({
            cleanPath: clean.path,
            keyTrailer,
            content,
            hook: finalHook,
            workspace,
            options
        })

        return {
            cleanR2: clean.r2Url,
            reelR2
        }

    } finally {
        // Исходник в R2 нужен только на время сборки.
        if (sourceTouched) {
            await deleteStoredSource(content, keyTrailer)
        }

        await workspace.cleanup()
    }
}

/**
 * Фаза `clean` ручной проверки. Первый запуск может взять clean из кэша (как раньше),
 * «Пересобрать» (`rebuild`) всегда собирает новый фрагмент `segmentVariant`.
 * Исходник остаётся в R2 до финала: «Пересобрать» не качает трейлер заново.
 */
export const prepareReelCleanPhase = async ({
    keyTrailer,
    content,
    segmentVariant,
    rebuild,
    framing = 'center',
    segment
}: {
    keyTrailer: string
    content: ReelContent
    segmentVariant: number
    rebuild: boolean
    /** Фрагмент нарезки, выбранный администратором. */
    segment?: {startSeconds: number, endSeconds: number}
    /** track — нарезка: камера следит за лицом по X; кэш clean не используется. */
    framing?: 'center' | 'track'
}): Promise<{cleanR2: string, previewR2: string}> => {
    assertTrailerKey(keyTrailer)

    const workspace = new ReelWorkspace()

    try {
        const clean = await obtainCleanVideo({
            keyTrailer,
            content,
            workspace,
            // Кэш clean мог быть собран по центру (тот же ключ раньше был трейлером).
            reuseCache: !rebuild && framing === 'center' && !segment,
            segmentVariant,
            reuseStoredSource: true,
            framing,
            segment
        })

        const previewR2 = await createCleanPreview({
            cleanPath: clean.path,
            keyTrailer,
            content,
            workspace
        })

        return {
            cleanR2: clean.r2Url,
            // Ссылка с версией: Telegram и кэш Cloudflare не отдадут прошлое превью.
            previewR2: freshR2Url(previewR2)
        }

    } finally {
        await workspace.cleanup()
    }
}

/** Фаза `hooks`: варианты хука по clean, который сейчас лежит в R2. */
export const prepareReelHookOptionsPhase = async ({
    keyTrailer,
    content
}: {
    keyTrailer: string
    content: ReelContent
}): Promise<string[]> => {
    assertTrailerKey(keyTrailer)

    const workspace = new ReelWorkspace()

    try {
        const clean = await downloadCachedClean({keyTrailer, content, workspace, requireCache: true})

        return await generateHookOptions({cleanPath: clean!.path, content})

    } finally {
        await workspace.cleanup()
    }
}

/**
 * Фаза `finish`: Reel из clean, который лежит в R2. `chosenHook` — выбор администратора;
 * без него (время выбора истекло) хук пишет Gemini, при его ошибке берётся `fallbackHook`.
 * Исходник в R2 удаляется: проверка закончена. Исключение — нарезка (`keepSource`):
 * её исходник удаляет финализатор после публикации в Telegram и Instagram.
 */
export const finishReelPhase = async ({
    keyTrailer,
    content,
    chosenHook,
    fallbackHook,
    keepSource = false,
    options = {}
}: {
    keyTrailer: string
    content: ReelContent
    chosenHook?: string
    fallbackHook: string
    /** Нарезка: исходник остаётся в R2 до полной публикации (удаляет финализатор). */
    keepSource?: boolean
    options?: PrepareReelOptions
}): Promise<{cleanR2: string, reelR2: string}> => {
    assertTrailerKey(keyTrailer)

    const workspace = new ReelWorkspace()

    try {
        const clean = (await downloadCachedClean({keyTrailer, content, workspace, requireCache: true}))!

        let hook = chosenHook?.trim()

        if (hook) {
            console.log('[REEL HOOK CHOSEN BY ADMIN]', {hook})
        } else {
            const automatic = await resolveAutomaticHook({
                cleanPath: clean.path,
                content,
                fallbackHook
            })
            hook = automatic.hook
            await saveGeneratedHook(automatic.generated, options.onHookGenerated)
        }

        const reelR2 = await finishReel({
            cleanPath: clean.path,
            keyTrailer,
            content,
            hook,
            workspace,
            options
        })

        return {cleanR2: clean.r2Url, reelR2}

    } finally {
        if (!keepSource) {
            await deleteStoredSource(content, keyTrailer)
        }
        await workspace.cleanup()
    }
}

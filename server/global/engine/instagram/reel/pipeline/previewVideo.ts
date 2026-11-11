import path from "node:path"
import {randomUUID} from "node:crypto"
import {execFile} from "node:child_process"
import {stat} from "node:fs/promises"
import {promisify} from "node:util"
import ffmpegPath from "ffmpeg-static"
import {storageCloudflareR2} from "#server/global/engine/instagram/reel/utils/storageCloudflareR2"
import {
    reelR2Paths,
    type ReelContent,
    runReelStep,
    type ReelWorkspace
} from "#server/global/engine/instagram/reel/pipeline/reelWorkspace"

const execFileAsync = promisify(execFile)

/** Telegram принимает видео по ссылке до 20 МБ; превью держим заметно меньше. */
export const PREVIEW_MAX_BYTES = 19 * 1024 * 1024

const PREVIEW_SIZE = 720

/**
 * Лёгкая копия clean только для просмотра в Telegram: 720×720, CRF 28, звук 96k
 * (около 3–6 МБ на 40 с). В ролик идёт полный clean, превью нигде больше не используется.
 */
export const createCleanPreview = async ({
    cleanPath,
    keyTrailer,
    content,
    workspace
}: {
    cleanPath: string
    keyTrailer: string
    content: ReelContent
    workspace: ReelWorkspace
}): Promise<string> => {
    if (!ffmpegPath) {
        throw new Error('[REEL PREVIEW] ffmpeg-static binary not found')
    }
    const binary = ffmpegPath

    const outputPath = path.join(
        path.dirname(cleanPath),
        `${keyTrailer}_${randomUUID()}_preview.mp4`
    )
    workspace.trackFile(outputPath)

    const encode = (crf: number) => execFileAsync(
        binary,
        [
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-i', cleanPath,
            '-vf', `scale=${PREVIEW_SIZE}:${PREVIEW_SIZE}:flags=bicubic,format=yuv420p`,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', String(crf),
            '-c:a', 'aac',
            '-b:a', '96k',
            '-movflags', '+faststart',
            outputPath
        ],
        {timeout: 180_000, maxBuffer: 20 * 1024 * 1024}
    )

    await runReelStep('CREATE_CLEAN_PREVIEW', async () => {
        await encode(28)

        if ((await stat(outputPath)).size > PREVIEW_MAX_BYTES) {
            // Очень зернистый исходник: второй проход заметно сильнее сжатием.
            await encode(34)
        }
    })

    const sizeBytes = (await stat(outputPath)).size
    if (sizeBytes > PREVIEW_MAX_BYTES) {
        throw new Error(`[REEL PREVIEW] Preview is ${sizeBytes} bytes, more than Telegram accepts by URL`)
    }

    return runReelStep(
        'UPLOAD_CLEAN_PREVIEW_TO_R2',
        () => storageCloudflareR2(outputPath, reelR2Paths(content, keyTrailer).preview)
    )
}

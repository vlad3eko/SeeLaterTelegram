import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {randomUUID} from 'node:crypto'
import ffmpegPath from 'ffmpeg-static'
import {storageCloudflareR2} from '#server/global/engine/instagram/reel/utils/storageCloudflareR2'
import {
    reelR2Paths,
    type ReelContent,
    ReelWorkspace,
    runReelStep
} from '#server/global/engine/instagram/reel/pipeline/reelWorkspace'
import {freshR2Url, obtainSourceVideo} from '#server/global/engine/instagram/reel/pipeline/cleanVideo'
import {buildSourceIndex} from '#server/global/engine/instagram/reel/fragments/sourceIndex'
import {requestFragmentsFromGemini} from '#server/global/engine/instagram/reel/fragments/selectFragments'
import {snapFragments} from '#server/global/engine/instagram/reel/fragments/snapFragments'
import type {ClipFragment} from '#server/global/engine/instagram/reel/fragments/types'
import {fastDecoderArgs} from '#server/global/engine/instagram/reel/utils/ffmpegDecoder'

const execFileAsync = promisify(execFile)

/** Превью фрагмента: 640×360 (весь кадр 16:9, чтобы видеть сцену), около 3–5 МБ на минуту. */
const renderPreview = async (sourcePath: string, fragment: ClipFragment, outputPath: string) => {
    if (!ffmpegPath) throw new Error('[REEL FRAGMENTS] ffmpeg-static binary not found')

    await execFileAsync(
        ffmpegPath as unknown as string,
        [
            '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
            '-ss', fragment.start.toFixed(3),
            ...await fastDecoderArgs(sourcePath),
            '-i', sourcePath,
            '-t', (fragment.end - fragment.start).toFixed(3),
            '-vf', 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
            '-c:a', 'aac', '-b:a', '96k',
            '-movflags', '+faststart',
            outputPath
        ],
        {timeout: 240_000, maxBuffer: 20 * 1024 * 1024}
    )
}

/**
 * Шаг «выбор фрагмента» для нарезки (ручная ветка): исходник (из R2 temp или с YouTube),
 * карта исходника, до 8 фрагментов от Gemini, подгонка границ, превью каждого в R2.
 * Исходник остаётся в R2 (нужен для clean выбранного фрагмента).
 */
export const prepareClipFragments = async ({
    keyTrailer,
    content
}: {
    keyTrailer: string
    content: ReelContent
}): Promise<{fragments: ClipFragment[], duration: number}> => {
    const workspace = new ReelWorkspace()

    try {
        const sourcePath = await obtainSourceVideo({keyTrailer, content, workspace, reuseStoredSource: true})

        const index = await runReelStep('BUILD_SOURCE_INDEX', () =>
            buildSourceIndex(sourcePath, path.dirname(sourcePath)))
        workspace.trackFile(index.proxyPath)

        const proposed = await runReelStep('GEMINI_SELECT_FRAGMENTS', () =>
            requestFragmentsFromGemini(index, {title: content.title, overview: content.overview}))

        const fragments = snapFragments(proposed, index)
        if (!fragments.length) {
            throw new Error('[REEL FRAGMENTS] No fragments left after snapping')
        }

        console.log('[REEL FRAGMENTS] Snapped', fragments.map(f => `${f.start}–${f.end} (${Math.round(f.end - f.start)} s) ${f.title}`))

        const paths = reelR2Paths(content, keyTrailer)
        await runReelStep('RENDER_FRAGMENT_PREVIEWS', async () => {
            let next = 0
            const worker = async () => {
                while (next < fragments.length) {
                    const index = next++
                    const fragment = fragments[index]!
                    const local = path.join(path.dirname(sourcePath), `${randomUUID()}_frag${index + 1}.mp4`)
                    workspace.trackFile(local)
                    await renderPreview(sourcePath, fragment, local)
                    const url = await storageCloudflareR2(local, paths.fragmentPreview(index + 1))
                    fragment.previewUrl = freshR2Url(url)
                }
            }
            await Promise.all([worker(), worker()])
        })

        return {fragments, duration: index.duration}

    } finally {
        await workspace.cleanup()
    }
}

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
import {requestFragmentsFromGemini, reviewFragmentStory} from '#server/global/engine/instagram/reel/fragments/selectFragments'
import {buildDialogue, transcribeSourceWords} from '#server/global/engine/instagram/reel/fragments/dialogue'
import {loadSourceTranscript, saveSourceTranscript} from '#server/global/engine/instagram/reel/fragments/sourceTranscript'
import {getInputVideoDuration} from '#server/global/engine/instagram/reel/utils/prepareInstagramVideo'
import {snapFragments} from '#server/global/engine/instagram/reel/fragments/snapFragments'
import type {ClipFragment} from '#server/global/engine/instagram/reel/fragments/types'
import {fastDecoderArgs} from '#server/global/engine/instagram/reel/utils/ffmpegDecoder'

const execFileAsync = promisify(execFile)

/**
 * Превью фрагмента: 640×360 (весь кадр 16:9, чтобы видеть сцену), около 3–5 МБ на минуту.
 * Режется из копии 640×360 карты исходника, а не из 4K: декодировать минуту 4K ради
 * картинки 640×360 восемь раз подряд незачем.
 */
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
 * карта исходника и расшифровка реплик (параллельно), до 8 фрагментов от Gemini,
 * подгонка границ по разговорам, проверка сюжета каждого фрагмента, превью в R2.
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

        // Карта исходника и расшифровка независимы: идут одновременно. Расшифровка
        // делается один раз на исходник и сохраняется в R2 (её же берут субтитры). Сбой
        // расшифровки не останавливает шаг (фрагменты выбираются по склейкам и паузам).
        const transcribe = async () => {
            const stored = await loadSourceTranscript(content, keyTrailer)
            if (stored) {
                console.log('[REEL FRAGMENTS] Transcript from R2', {words: stored.words.length})
                return stored.words
            }
            const words = await transcribeSourceWords(sourcePath)
            if (words?.length) {
                await saveSourceTranscript(content, keyTrailer, words, await getInputVideoDuration(sourcePath))
            }
            return words
        }
        const [sourceIndex, words] = await Promise.all([
            runReelStep('BUILD_SOURCE_INDEX', () => buildSourceIndex(sourcePath, path.dirname(sourcePath))),
            runReelStep('TRANSCRIBE_SOURCE', transcribe)
        ])
        workspace.trackFile(sourceIndex.proxyPath)
        workspace.trackFile(sourceIndex.previewSourcePath)
        const dialogue = words?.length ? buildDialogue(words, sourceIndex.duration) : null
        if (dialogue) {
            console.log('[REEL FRAGMENTS] Dialogue', {
                words: words!.length,
                lines: dialogue.lines.length,
                blocks: dialogue.blocks.length
            })
        }
        const index = {...sourceIndex, dialogue}
        const context = {title: content.title, overview: content.overview}

        const proposed = await runReelStep('GEMINI_SELECT_FRAGMENTS', () =>
            requestFragmentsFromGemini(index, context))

        let fragments = snapFragments(proposed, index)
        if (dialogue && fragments.length) {
            console.log('[REEL FRAGMENTS] Before story review', fragments.map(f => `${f.start}–${f.end}`))
            const reviewed = await runReelStep('GEMINI_REVIEW_FRAGMENT_STORY', () =>
                reviewFragmentStory(fragments, dialogue, context))
            // Исправленные варианты первыми; если исправление совпало с другим вариантом,
            // остаётся прежняя версия этого фрагмента (вариантов не становится меньше).
            const resnapped = snapFragments([...reviewed, ...fragments], index)
            if (resnapped.length) fragments = resnapped
        }
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
                    await renderPreview(sourceIndex.previewSourcePath, fragment, local)
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

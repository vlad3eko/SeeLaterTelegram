import {promisify} from "node:util";
import {execFile} from "node:child_process";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const execFileAsync =
    promisify(execFile)

const escapeDrawtext = (
    text: string
) =>
    text
        .replace(/\\/g, '\\\\')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")
        .replace(/%/g, '\\%')

const wrapText = (
    text: string,
    maxChars = 28
) => {

    const words =
        text
            .trim()
            .split(/\s+/)

    const lines: string[] = []

    let current = ''

    for (const word of words) {

        const candidate =
            current
                ? `${current} ${word}`
                : word

        if (candidate.length <= maxChars) {
            current = candidate
            continue
        }

        if (current) {
            lines.push(current)
        }

        current = word
    }

    if (current) {
        lines.push(current)
    }

    return lines.join('\n')
}

export const decorateInstagramVideo = async (
    inputPath: string,
    keyTrailer: string,
    hook: string
) => {

    const outputPath =
        path.join(
            path.dirname(inputPath),
            `${keyTrailer}_reel.mp4`
        )

    const logoPath =
        path.join(
            process.cwd(),
            'public',
            'instagram',
            'logo.png'
        )

    const safeHook =
        escapeDrawtext(
            wrapText(
                hook,
                28
            )
        )

    const safeBottomText =
        escapeDrawtext(
            'НАЗВАНИЕ В ОПИСАНИИ'
        )

    const filterComplex = [

        // Watermark
        '[1:v]scale=trunc(iw*0.225/2)*2:trunc(ih*0.225/2)*2,format=rgba,colorchannelmixer=aa=0.1[logo]',

        // 537 = начало области видео
        // +40 = отступ сверху
        '[0:v][logo]overlay=x=W-w-40:y=577:shortest=1[videoWithLogo]',

        // Hook
        `[videoWithLogo]drawtext=fontfile='public/assets/Natural_Mono_ Regular.ttf':text='${safeHook}':fontcolor=white:fontsize=58:line_spacing=8:box=1:boxcolor=black@0:boxw=1080:text_align=center:x=0:y=350[withHook]`,

        // Нижний текст
        `[withHook]drawtext=fontfile='public/assets/Natural_Mono_ Regular.ttf':text='${safeBottomText}':fontcolor=white:fontsize=42:box=1:boxcolor=black@0:boxw=1080:text_align=center:x=0:y=1535[withBottomText]`,

        '[withBottomText]setsar=1[vout]'

    ].join(';')

    try {

        await execFileAsync(
            ffmpegPath!,
            [
                '-y',

                '-i',
                inputPath,

                // Logo
                '-loop',
                '1',

                '-i',
                logoPath,

                '-filter_complex',
                filterComplex,

                '-map',
                '[vout]',

                '-map',
                '0:a?',

                '-shortest',

                '-r',
                '30',

                '-c:v',
                'libx264',

                '-profile:v',
                'high',

                '-level',
                '4.0',

                '-pix_fmt',
                'yuv420p',

                '-preset',
                'fast',

                '-crf',
                '23',

                '-c:a',
                'aac',

                '-b:a',
                '96k',

                '-ar',
                '48000',

                '-ac',
                '1',

                '-movflags',
                '+faststart',

                outputPath
            ],
            {
                maxBuffer:
                    50 * 1024 * 1024
            }
        )

    } catch (error: any) {

        console.error(
            '[DECORATE INSTAGRAM VIDEO ERROR]',
            error?.stderr ||
            error?.message ||
            error
        )

        throw error
    }

    return outputPath
}

import {promisify} from "node:util";
import {execFile} from "node:child_process";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const execFileAsync =
    promisify(execFile)

export const prepareInstagramVideo = async (
    inputPath: string,
    keyTrailer: string
) => {

    const outputPath =
        path.join(
            path.dirname(inputPath),
            `${keyTrailer}_instagram_prepared.mp4`
        )

    const filterComplex = [
        // Исходное видео увеличиваем до 180%
        '[0:v]scale=1944:1094,crop=1080:845[video]',

        // Чёрный canvas Reel 1080x1920
        'color=c=black:s=1080x1920[canvas]',

        // Размещаем видео по центру canvas
        // shortest=1 обязательно, иначе color создаёт бесконечный поток
        '[canvas][video]overlay=0:537:shortest=1[prepared]',

        '[prepared]setsar=1[vout]'
    ].join(';')

    try {

        await execFileAsync(
            ffmpegPath!,
            [
                '-y',

                '-i',
                inputPath,

                '-filter_complex',
                filterComplex,

                '-map',
                '[vout]',

                '-map',
                '0:a?',

                // Дополнительная защита от бесконечного вывода
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
            '[PREPARE INSTAGRAM VIDEO ERROR]',
            error?.stderr ||
            error?.message ||
            error
        )

        throw error
    }

    return outputPath
}

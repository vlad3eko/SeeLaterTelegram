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

    const backgroundPath =
        path.join(
            process.cwd(),
            'public',
            'instagram',
            'bg.jpg'
        )

    const filterComplex = [
        // Исходное видео увеличиваем до 180%
        '[0:v]scale=1944:1094,crop=1080:845[video]',

        // Фон увеличиваем пропорционально до полного покрытия 1080x1920
        // force_original_aspect_ratio=increase
        // сохраняет пропорции и увеличивает картинку до тех пор,
        // пока она полностью не закроет canvas
        '[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[background]',

        // Размещаем видео по центру canvas
        '[background][video]overlay=0:537:shortest=1[prepared]',

        '[prepared]setsar=1[vout]'
    ].join(';')

    try {

        await execFileAsync(
            ffmpegPath!,
            [
                '-y',

                // Основное видео
                '-i',
                inputPath,

                // Фоновая картинка
                // loop нужен, чтобы фон существовал
                // на протяжении всего видео
                '-loop',
                '1',

                '-i',
                backgroundPath,

                '-filter_complex',
                filterComplex,

                '-map',
                '[vout]',

                '-map',
                '0:a?',

                // Защита от бесконечного вывода
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

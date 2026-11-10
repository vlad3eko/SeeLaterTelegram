import {mkdir, readdir, rm} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {runYtDlp} from "#server/global/engine/instagram/scripts-yt-bgutil/ytDlp";
import ffmpegPath from "ffmpeg-static";
import {isYouTubeVideoId} from "#server/global/engine/instagram/reel/utils/extractYouTubeVideoId";

// YouTube с серверных IP (Cloud Run, Vercel) периодически отвечает 403 посреди загрузки,
// хотя метаданные получены. Повторный запуск заново получает ссылку на видео и обычно проходит.
const DOWNLOAD_ATTEMPTS = 3
const RETRY_DELAYS_MS = [3_000, 8_000]

// Эти ошибки повтором не лечатся: видео закрыто, удалено или недоступно.
const PERMANENT_ERROR_PATTERN =
    /video unavailable|private video|has been removed|account associated with this video has been terminated|not available in your country|is not a valid url|members-only|this video is not available/i

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

// Остатки неудачной попытки (.part, .f137.mp4, .ytdl) убираем, чтобы следующая попытка начала с чистого файла.
const removeDownloadLeftovers = async (
    outputDir: string,
    keyTrailer: string
) => {
    try {
        const names = await readdir(outputDir)

        await Promise.all(
            names
                .filter((name) => name.startsWith(`${keyTrailer}.`))
                .map((name) => rm(path.join(outputDir, name), {force: true}))
        )
    } catch {
        // Папки может не быть или файл занят: это не должно скрывать исходную ошибку скачивания.
    }
}

export const downloadTrailer = async (
    keyTrailer: string
) => {
    if (!keyTrailer) {
        throw new Error('Trailer key is missing')
    }

    if (!isYouTubeVideoId(keyTrailer)) {
        throw new Error('Trailer key is not a valid YouTube video id')
    }

    const outputDir =
        path.join(
            os.tmpdir(),
            'instagram'
        )

    await mkdir(
        outputDir,
        {
            recursive: true
        }
    )

    const outputTemplate =
        path.join(
            outputDir,
            `${keyTrailer}.%(ext)s`
        )

    const url =
        `https://www.youtube.com/watch?v=${keyTrailer}`

    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
        try {
            const {stdout, stderr} =
                await runYtDlp([
                    '--ffmpeg-location',
                    ffmpegPath!,

                    '--no-playlist',

                    '-f',
                    'bv*+ba/b',

                    '--merge-output-format',
                    'mp4',

                    '-o',
                    outputTemplate,

                    url
                ])

            console.log(
                '[YTDLP DOWNLOAD]',
                stdout
            )

            if (stderr) {
                console.log(
                    '[YTDLP STDERR]',
                    stderr
                )
            }

            break
        } catch (error: any) {
            const details =
                String(error?.stderr || error?.message || error)

            console.error(
                '[YTDLP DOWNLOAD ERROR]',
                {attempt, attempts: DOWNLOAD_ATTEMPTS},
                details
            )

            const isLastAttempt =
                attempt === DOWNLOAD_ATTEMPTS

            if (isLastAttempt || PERMANENT_ERROR_PATTERN.test(details)) {
                throw error
            }

            await removeDownloadLeftovers(outputDir, keyTrailer)

            const delayMs =
                RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1)!

            console.warn(
                `[YTDLP DOWNLOAD RETRY] attempt ${attempt + 1}/${DOWNLOAD_ATTEMPTS} in ${delayMs} ms`
            )

            await sleep(delayMs)
        }
    }

    return path.join(
        outputDir,
        `${keyTrailer}.mp4`
    )
}

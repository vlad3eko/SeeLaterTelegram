import {promisify} from "node:util";
import {execFile} from "node:child_process";
import {writeFile, unlink} from "node:fs/promises";
import path from "node:path";
import {existsSync} from "node:fs";
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


const escapeFilterPath = (
    value: string
) =>
    value
        .replace(/\\/g, '/')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")


const escapeAssText = (
    text: string
) =>
    text
        .replace(/\\/g, '')
        .replace(/[{}]/g, '')
        .replace(/\r/g, '')


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


/**
 * Убираем emoji из hook.
 * Они будут добавлены как PNG.
 */
const removeStickerEmoji = (
    text: string
) =>
    text
        .replace(/🔥/gu, '')
        .replace(/\s{2,}/g, ' ')
        .trim()


/**
 * Длительность появления каждой буквы.
 *
 * 200 centiseconds = 2 секунды.
 */
const createCharacterDurations = (
    count: number
) => {

    if (count <= 0) {
        return []
    }

    const total =
        200

    const base =
        Math.floor(
            total / count
        )

    const remainder =
        total % count

    return Array.from(
        {length: count},
        (_, index) =>
            base +
            (
                index < remainder
                    ? 1
                    : 0
            )
    )
}


/**
 * ASS-анимация hook.
 *
 * Блок начинается на y=350 — как в старой версии.
 */
const createAnimatedAssText = (
    hook: string
) => {

    const cleanHook =
        removeStickerEmoji(
            hook
        )

    const wrappedHook =
        wrapText(
            cleanHook,
            28
        )

    const lines =
        wrappedHook
            .split('\n')
            .map(line =>
                escapeAssText(line)
            )
            .filter(Boolean)

    if (!lines.length) {
        return ''
    }


    /**
     * Сохраняем слова для выбора случайного
     * красного слова.
     */
    const wordPositions: {
        lineIndex: number
        wordIndex: number
        word: string
    }[] = []


    lines.forEach(
        (
            line,
            lineIndex
        ) => {

            const words =
                line
                    .split(/\s+/)
                    .filter(Boolean)

            words.forEach(
                (
                    word,
                    wordIndex
                ) => {

                    wordPositions.push({
                        lineIndex,
                        wordIndex,
                        word
                    })

                }
            )

        }
    )


    /**
     * Стараемся выбрать не короткое слово.
     */
    const longWords =
        wordPositions.filter(
            item =>
                item.word
                    .replace(
                        /[^\p{L}\p{N}]/gu,
                        ''
                    )
                    .length >= 4
        )


    const candidates =
        longWords.length
            ? longWords
            : wordPositions


    const randomWord =
        candidates.length
            ? candidates[
                Math.floor(
                    Math.random() *
                    candidates.length
                )
                ]
            : null


    /**
     * Общее количество букв.
     */
    const visibleCharacters =
        lines
            .join('')
            .replace(/\s/g, '')
            .length


    /**
     * Весь hook появляется ровно за 2 секунды.
     */
    const durations =
        createCharacterDurations(
            visibleCharacters
        )


    let durationIndex =
        0


    const renderedLines =
        lines.map(
            (
                line,
                lineIndex
            ) => {

                const tokens =
                    line.split(/(\s+)/)

                let realWordIndex =
                    0

                let result =
                    ''


                for (const token of tokens) {

                    /**
                     * Пробелы не анимируем.
                     */
                    if (/^\s+$/.test(token)) {
                        result += token
                        continue
                    }


                    const isHighlighted =
                        randomWord &&
                        lineIndex ===
                        randomWord.lineIndex &&
                        realWordIndex ===
                        randomWord.wordIndex


                    if (isHighlighted) {

                        /**
                         * Красный #FF2638
                         * в ASS записывается BGR:
                         * 3826FF
                         */
                        result +=
                            '{\\1c&H3826FF&}'
                    }


                    for (
                        const char of
                        escapeAssText(token)
                        ) {

                        const duration =
                            durations[
                                durationIndex
                                ] ?? 1

                        durationIndex++


                        result +=
                            `{\\k${duration
                                .toString()
                                .padStart(2, '0')}}${char}`
                    }


                    if (isHighlighted) {

                        result +=
                            '{\\1c&HFFFFFF&}'
                    }


                    realWordIndex++
                }


                return result
            }
        )
            .join('\\N')


    return `\
[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: None

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Roboto Condensed,58,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,8,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:59:59.00,Hook,,0,0,0,,{\\an8\\pos(540,350)}${renderedLines}
`
}


/**
 * Приблизительная ширина последней строки.
 *
 * Нужна только для того, чтобы поставить
 * 3 fire.png сразу после последнего слова.
 */
const estimateTextWidth = (
    text: string,
    fontSize = 58
) => {

    let width = 0

    for (const char of text) {

        if (char === ' ') {
            width += fontSize * 0.30
            continue
        }

        if (/[.,!?;:'"()]/.test(char)) {
            width += fontSize * 0.28
            continue
        }

        /**
         * Узкие буквы.
         */
        if (
            /[ІЇIЙЛЦЩШЖТФ]/.test(char)
        ) {
            width += fontSize * 0.58
            continue
        }

        width += fontSize * 0.55
    }

    return width
}


/**
 * Фильтры трёх fire.png.
 *
 * Они располагаются сразу после последнего
 * слова последней строки.
 */
const createFireFilters = (
    hook: string,
    inputStartIndex = 2
) => {

    const cleanHook =
        removeStickerEmoji(
            hook
        )

    const wrappedHook =
        wrapText(
            cleanHook,
            28
        )

    const lines =
        wrappedHook
            .split('\n')
            .filter(Boolean)

    if (!lines.length) {
        return {
            filters: [],
            finalLabel: 'withHook'
        }
    }


    const lastLine = lines[lines.length - 1]
    const fontSize = 58
    const fireSize = 52
    const gap = 4

    /**
     * Начало строки.
     */
    const lineWidth =
        estimateTextWidth(
            lastLine!,
            fontSize
        )


    const lineStartX =
        (1080 - lineWidth) / 2


    /**
     * Три огня идут после текста.
     */
    const fireStartX =
        lineStartX +
        lineWidth +
        10


    /**
     * Если последняя строка слишком длинная,
     * чуть уменьшаем размер огней.
     */
    const availableWidth =
        1080 -
        fireStartX -
        15


    const finalFireSize =
        Math.max(
            38,
            Math.min(
                fireSize,
                Math.floor(
                    (
                        availableWidth -
                        gap * 2
                    ) / 3
                )
            )
        )


    /**
     * Вертикально примерно по центру
     * относительно последней строки.
     *
     * Последняя строка:
     * 350 + 65 * (lines - 1)
     */
    const lineHeight =
        65

    const lastLineY =
        350 +
        lineHeight *
        (lines.length - 1)


    const fireY =
        Math.round(
            lastLineY +
            (
                fontSize -
                finalFireSize
            ) / 2
        )


    const filters: string[] = []

    let previous =
        'withHook'


    for (let i = 0; i < 3; i++) {

        const inputIndex =
            inputStartIndex + i

        const fireLabel =
            `fire${i}`

        const outputLabel =
            `withFire${i}`


        /**
         * Уменьшаем PNG.
         */
        filters.push(
            `[${inputIndex}:v]` +
            `scale=${finalFireSize}:${finalFireSize}` +
            `[${fireLabel}]`
        )


        const x =
            Math.round(
                fireStartX +
                i *
                (
                    finalFireSize +
                    gap
                )
            )


        filters.push(
            `[${previous}][${fireLabel}]` +
            `overlay=` +
            `x=${x}:` +
            `y=${fireY}:` +
            `shortest=0` +
            `[${outputLabel}]`
        )


        previous =
            outputLabel
    }


    return {
        filters,
        finalLabel: previous
    }
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


    /**
     * Шрифт 700.
     */
    const hookFontDir =
        path.join(
            process.cwd(),
            'public',
            'assets'
        )


    const hookFontPath =
        path.join(
            hookFontDir,
            'RobotoCondensed-Bold.ttf'
        )


    const hookFontName =
        existsSync(hookFontPath)
            ? 'Roboto Condensed'
            : 'DejaVu Sans Condensed'


    /**
     * ASS временный файл.
     */
    const assPath =
        path.join(
            path.dirname(inputPath),
            `${keyTrailer}_hook.ass`
        )


    const assContent =
        createAnimatedAssText(
            hook
        )


    await writeFile(
        assPath,
        assContent,
        'utf8'
    )


    const safeBottomText =
        escapeDrawtext(
            'НАЗВАНИЕ В ОПИСАНИИ'
        )


    /**
     * fire.png
     */
    const firePath =
        path.join(
            process.cwd(),
            'public',
            'instagram',
            'stickers',
            'fire.png'
        )


    if (!existsSync(firePath)) {

        throw new Error(
            `[DECORATE] fire.png not found: ${firePath}`
        )
    }


    /**
     * Inputs:
     *
     * 0 = video
     * 1 = logo
     * 2 = fire
     * 3 = fire
     * 4 = fire
     */
    const filterComplexParts = [

        // Logo
        '[1:v]' +
        'scale=trunc(iw*0.225/2)*2:' +
        'trunc(ih*0.225/2)*2,' +
        'format=rgba,' +
        'colorchannelmixer=aa=0.1' +
        '[logo]',


        // Logo overlay
        '[0:v][logo]' +
        'overlay=' +
        'x=W-w-40:' +
        'y=577:' +
        'shortest=1' +
        '[videoWithLogo]',


        // Animated Hook
        `[videoWithLogo]` +
        `subtitles=` +
        `filename='${escapeFilterPath(assPath)}':` +
        `fontsdir='${escapeFilterPath(hookFontDir)}'` +
        `[withHook]`
    ]


    /**
     * Добавляем 3 огня после последнего слова.
     */
    const fireFilters =
        createFireFilters(
            hook,
            2
        )


    filterComplexParts.push(
        ...fireFilters.filters
    )


    const finalBeforeBottom =
        fireFilters.finalLabel


    /**
     * Нижний текст.
     *
     * Оставляем полностью как у тебя.
     */
    filterComplexParts.push(

        `[${finalBeforeBottom}]` +
        `drawtext=` +
        `fontfile='public/assets/Natural_Mono_ Regular.ttf':` +
        `text='${safeBottomText}':` +
        `fontcolor=white:` +
        `fontsize=42:` +
        `box=1:` +
        `boxcolor=black@0:` +
        `boxw=1080:` +
        `text_align=center:` +
        `x=0:` +
        `y=1535` +
        `[withBottomText]`
    )


    filterComplexParts.push(
        '[withBottomText]setsar=1[vout]'
    )


    const filterComplex =
        filterComplexParts.join(';')


    try {

        await execFileAsync(
            ffmpegPath!,
            [
                '-y',

                // Video
                '-i',
                inputPath,

                // Logo
                '-loop',
                '1',

                '-i',
                logoPath,

                // FIRE #1
                '-loop',
                '1',

                '-i',
                firePath,

                // FIRE #2
                '-loop',
                '1',

                '-i',
                firePath,

                // FIRE #3
                '-loop',
                '1',

                '-i',
                firePath,

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

    } finally {

        await unlink(
            assPath
        ).catch(() => {})
    }

    return outputPath
}

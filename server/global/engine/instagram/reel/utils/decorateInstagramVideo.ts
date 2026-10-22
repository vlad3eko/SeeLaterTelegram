import {promisify} from 'node:util'
import {execFile} from 'node:child_process'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import {randomUUID} from "node:crypto";
import {mkdir, readFile, unlink, writeFile} from "node:fs/promises";
import {ensureReelOverlayAssets} from "#server/global/engine/instagram/reel/utils/prepareInstagramVideo";
import {existsSync} from "node:fs";

const execFileAsync = promisify(execFile)

type DecorateInstagramVideoOptions = {
    title?: string
    genre?: string | Array<{
        id?: number
        name?: string
    } | string>
    rating?: string | number
    subtitlesPath?: string
    highlightWord?: string
}

type SubtitleCue = {
    start: number
    end: number
    text: string
}

const escapeFilterPath = (value: string) =>
    value
        .replace(/\\/g, '/')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")

const escapeAssText = (value: string) =>
    value
        .replace(/\\/g, '')
        .replace(/[{}]/g, '')
        .replace(/\r/g, '')
        .replace(/\n/g, '\\N')

const splitHookIntoTwoLines = (hook: string): [string, string] => {
    const normalized = String(hook ?? '')
        .trim()
        .toLocaleUpperCase('ru-RU')

    if (!normalized) {
        throw new Error(
            '[DECORATE] Empty Instagram hook. Check createInstagramHook() logs.'
        )
    }

    const words = normalized.split(' ').filter(Boolean)

    if (words.length < 2) {
        throw new Error(
            `[DECORATE] Hook must contain at least two words: "${normalized}"`
        )
    }

    let bestIndex = 1
    let bestScore = Number.POSITIVE_INFINITY

    for (let index = 1; index < words.length; index++) {
        const firstLine = words.slice(0, index).join(' ')
        const secondLine = words.slice(index).join(' ')

        const longest = Math.max(
            firstLine.length,
            secondLine.length
        )

        const imbalance = Math.abs(
            firstLine.length - secondLine.length
        )

        const overflow = Math.max(0, longest - 25)

        const score = longest * 4 + imbalance + overflow * 20

        if (score < bestScore) {
            bestScore = score
            bestIndex = index
        }
    }

    return [
        words.slice(0, bestIndex).join(' '),
        words.slice(bestIndex).join(' '),
    ]
}
const formatTitleLineAss = (line: string): string => {
    const category = line.match(
        /^(МУЛЬТСЕРИАЛ|МУЛЬТФИЛЬМ|СЕРИАЛ|ФИЛЬМ|АНИМЕ)(?=\s|$)/u
    )

    if (!category) {
        return escapeAssText(line)
    }

    const categoryText = category[1]!

    const rest = line.slice(categoryText.length)

    return (
        `{\\c&H002B26E0&}${escapeAssText(categoryText)}` +
        `{\\c&H00EEF2F5&}${escapeAssText(rest)}`
    )
}

const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value))

const formatAssTime = (seconds: number) => {
    const safeSeconds = Math.max(0, seconds)
    const hours = Math.floor(safeSeconds / 3600)
    const minutes = Math.floor((safeSeconds % 3600) / 60)
    const wholeSeconds = Math.floor(safeSeconds % 60)
    const centiseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 100)

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
}

const parseSubtitleTime = (value: string) => {
    const normalized = value.trim().replace(',', '.')
    const match = normalized.match(/^(\d{1,2}):(\d{2}):(\d{2})\.(\d{1,3})$/)

    if (!match) {
        return undefined
    }

    const hours = Number(match[1])
    const minutes = Number(match[2])
    const seconds = Number(match[3])
    const milliseconds = Number(match[4]!.padEnd(3, '0'))
// заглушка!
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

const wrapSubtitleText = (text: string, maxChars = 27) => {
    const words = text.trim().split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let current = ''

    for (const word of words) {
        // Split unusually long words rather than allow them to run outside the canvas.
        if (word.length > maxChars) {
            if (current) {
                lines.push(current)
                current = ''
            }

            for (let offset = 0; offset < word.length; offset += maxChars) {
                lines.push(word.slice(offset, offset + maxChars))
            }

            continue
        }

        const candidate = current ? `${current} ${word}` : word

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

    // A subtitle event is limited to two visual lines. Longer cues are split into
    // consecutive two-line cards while preserving the original cue's time range.
    const screens: string[] = []

    for (let index = 0; index < lines.length; index += 2) {
        screens.push(lines.slice(index, index + 2).join('\\N'))
    }

    return screens.length ? screens : ['']
}

const readSubtitleCues = async (subtitlesPath: string): Promise<SubtitleCue[]> => {
    const extension = path.extname(subtitlesPath).toLowerCase()
    let subtitleText: string

    if (['.ass', '.ssa', '.vtt'].includes(extension)) {
        if (!ffmpegPath) {
            throw new Error('[DECORATE] ffmpeg-static binary not found for subtitle conversion')
        }

        const {stdout} = await execFileAsync(
            ffmpegPath,
            [
                '-hide_banner',
                '-loglevel', 'error',
                '-i', subtitlesPath,
                '-f', 'srt',
                '-'
            ],
            {
                timeout: 20_000,
                maxBuffer: 10 * 1024 * 1024
            }
        )

        subtitleText = stdout

    } else {
        subtitleText = await readFile(subtitlesPath, 'utf8')
    }

    const blocks = subtitleText
        .replace(/^\uFEFF/, '')
        .replace(/\r/g, '')
        .split(/\n\s*\n/)

    const cues: SubtitleCue[] = []

    for (const block of blocks) {
        const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
        const timingIndex = lines.findIndex(line => line.includes('-->'))

        if (timingIndex < 0) {
            continue
        }

        const timing = lines[timingIndex]!.split('-->')
        const start = parseSubtitleTime(timing[0] ?? '')
        const end = parseSubtitleTime((timing[1] ?? '').split(/\s+/)[0] ?? '')

        if (start === undefined || end === undefined || end <= start) {
            continue
        }

        const rawText = lines
            .slice(timingIndex + 1)
            .join(' ')
            .replace(/<[^>]*>/g, '')
            .replace(/\{[^}]*}/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleUpperCase('ru-RU')

        if (rawText) {
            cues.push({start, end, text: rawText})
        }
    }

    return cues
}

const applyHighlight = (text: string, highlightWord?: string) => {
    const parts = text.split('\\N')

    const renderPart = (part: string) => {
        const safePart = escapeAssText(part)

        if (!highlightWord?.trim()) {
            return safePart
        }

        const escapedWord = escapeAssText(highlightWord.trim().toLocaleUpperCase('ru-RU'))
        const escapedPattern = escapedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const wordPattern = new RegExp(`(^|[\\s.,!?;:()])(${escapedPattern})(?=$|[\\s.,!?;:()])`, 'u')

        return safePart.replace(
            wordPattern,
            (_match, before: string, word: string) =>
                `${before}{\\c&H002B26E0&}${word}{\\c&H00EEF2F5&}`
        )
    }

    return parts.map(renderPart).join('\\N')
}

const createSubtitleAss = async (subtitlesPath: string, duration: number, highlightWord?: string) => {
    const cues = await readSubtitleCues(subtitlesPath)
    const events: string[] = []

    for (const cue of cues) {
        const start = clamp(cue.start, 0, duration)
        const end = clamp(cue.end, 0, duration)

        if (end <= start) {
            continue
        }

        const screens = wrapSubtitleText(cue.text)
        const screenDuration = (end - start) / screens.length

        screens.forEach((screen, index) => {
            const screenStart = start + screenDuration * index
            const screenEnd = index === screens.length - 1
                ? end
                : start + screenDuration * (index + 1)

            events.push(
                `Dialogue: 0,${formatAssTime(screenStart)},${formatAssTime(screenEnd)},Sub,,0,0,0,,${applyHighlight(screen, highlightWord)}`
            )
        })
    }

    return [
        '[Script Info]',
        'ScriptType: v4.00+',
        'PlayResX: 1080',
        'PlayResY: 1920',
        'WrapStyle: 2',
        'ScaledBorderAndShadow: yes',
        'YCbCr Matrix: None',
        '',
        '[V4+ Styles]',
        'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
        // Exact subtitle style from the supplied layout specification.
        'Style: Sub,Oswald,62,&H00EEF2F5,&H00EEF2F5,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,3,2,2,60,60,536,1',
        '',
        '[Events]',
        'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text',
        ...events
    ].join('\n')
}

const estimateAssTextWidth = (text: string, fontSize: number, spacing = 2): number => {
    let width = 0

    for (const char of text) {
        if (char === ' ') {
            width += fontSize * 0.28
        } else if (/[.,:;·]/u.test(char)) {
            width += fontSize * 0.28
        } else if (/[ІЇIТЛГ]/u.test(char)) {
            width += fontSize * 0.36
        } else if (/[МШЖЩФЮЫЪ]/u.test(char)) {
            width += fontSize * 0.72
        } else {
            width += fontSize * 0.52
        }
    }

    return width + Math.max(0, Array.from(text).length - 1) * spacing
}

const wrapAssTextByWidth = (text: string, fontSize: number, maxWidth = 960, spacing = 2): string[] => {
    const words = text.trim().split(/\s+/u).filter(Boolean)
    const lines: string[] = []
    let current = ''

    for (const word of words) {
        // Защита для необычно длинного слова без пробелов.
        if (estimateAssTextWidth(word, fontSize, spacing) > maxWidth) {
            if (current) {
                lines.push(current)
                current = ''
            }

            let chunk = ''
            for (const char of Array.from(word)) {
                const candidate = chunk + char
                if (chunk && estimateAssTextWidth(candidate, fontSize, spacing) > maxWidth) {
                    lines.push(chunk)
                    chunk = char
                } else {
                    chunk = candidate
                }
            }
            current = chunk
            continue
        }

        const candidate = current ? `${current} ${word}` : word
        if (estimateAssTextWidth(candidate, fontSize, spacing) <= maxWidth) {
            current = candidate
        } else {
            if (current) lines.push(current)
            current = word
        }
    }

    if (current) lines.push(current)
    return lines
}

const fitMetadataToTwoLines = (text: string): { lines: string[], fontSize: number } => {
    const maxWidth = 960
    const spacing = 2

    for (const fontSize of [36, 34, 32, 30, 28, 26, 24]) {
        const lines = wrapAssTextByWidth(text, fontSize, maxWidth, spacing)
        if (lines.length <= 2) {
            return {lines, fontSize}
        }
    }

    // Крайний случай с аномально длинным списком жанров: две строки
    // важнее выхода текста за ширину кадра. Вторая строка получает многоточие.
    const fontSize = 24
    const lines = wrapAssTextByWidth(text, fontSize, maxWidth, spacing)
    const visible = lines.slice(0, 2)

    if (lines.length > 2 && visible.length === 2) {
        let second = visible[1]!
        while (
            second.length > 0 &&
            estimateAssTextWidth(`${second}…`, fontSize, spacing) > maxWidth
            ) {
            second = Array.from(second).slice(0, -1).join('')
        }
        visible[1] = `${second.trimEnd()}…`
    }

    return {lines: visible, fontSize}
}

const createTemplateAss = (duration: number, options: DecorateInstagramVideoOptions, hook: string) => {
    const end = formatAssTime(duration)
    const events: string[] = []

    const [firstTitle, secondTitle] = splitHookIntoTwoLines(hook)

    const longestTitleLine = Math.max(
        firstTitle.length,
        secondTitle.length
    )

    const titleFontSize =
        longestTitleLine > 26 ? 90 :
            longestTitleLine > 23 ? 100 :
                longestTitleLine > 20 ? 112 :
                    longestTitleLine > 18 ? 124 : 132

    const firstTitleY = 232
    const secondTitleY = firstTitleY + Math.round(50 + titleFontSize * 0.36)

    events.push(
        `Dialogue: 0,0:00:00.00,${end},Shadow,,0,0,0,,{\\an8\\pos(540,${firstTitleY + 4})\\fsp0\\fs${titleFontSize}\\blur8\\bord0\\shad0\\1c&H000000&\\1a&HB3&}${escapeAssText(firstTitle)}`,
        `Dialogue: 1,0:00:00.00,${end},Title,,0,0,0,,{\\an8\\pos(540,${firstTitleY})\\fsp0\\fs${titleFontSize}\\bord1.2\\3c&H000000&}${formatTitleLineAss(firstTitle)}`,
        `Dialogue: 0,0:00:00.00,${end},Shadow,,0,0,0,,{\\an8\\pos(540,${secondTitleY + 4})\\fsp0\\fs${titleFontSize}\\blur8\\bord0\\shad0\\1c&H000000&\\1a&HB3&}${escapeAssText(secondTitle)}`,
        `Dialogue: 1,0:00:00.00,${end},Title,,0,0,0,,{\\an8\\pos(540,${secondTitleY})\\fsp0\\fs${titleFontSize}\\bord1.2\\3c&H000000&}${formatTitleLineAss(secondTitle)}`
    )

    const genre = Array.isArray(options.genre)
        ? options.genre
            .map(item => typeof item === 'string' ? item : item.name ?? '')
            .map(name => name.trim())
            .filter(Boolean)
            .join(' ')
        : String(options.genre ?? '').trim()

    const rawRating = typeof options.rating === 'number'
        ? options.rating
        : Number(String(options.rating ?? '').trim().replace(',', '.'))

    // Ноль, пустая строка, прочерк и некорректное значение означают
    // отсутствие рейтинга. Не рисуем ложные 0.0 и не оставляем лишнюю точку.
    const rating = Number.isFinite(rawRating) && rawRating > 0 && rawRating <= 10
        ? rawRating.toFixed(1)
        : ''

    const metadataText = [
        escapeAssText(genre.toLocaleUpperCase('ru-RU')),
        rating
    ].filter(Boolean).join(' · ')

    if (metadataText) {
        const {lines, fontSize} = fitMetadataToTwoLines(metadataText)

        lines.forEach((line, index) => {
            const y = lines.length === 1
                ? 1469
                : index === 0 ? 1442 : 1478

            events.push(
                `Dialogue: 1,0:00:00.00,${end},Meta,,0,0,0,,{\\an5\\pos(540,${y})\\fsp2\\fs${fontSize}}${escapeAssText(line)}`
            )
        })
    }

    const badgeText = (options.title)?.toUpperCase()
    const callToAction = 'Сохрани, чтобы не потерять'

    events.push(
        `Dialogue: 1,0:00:00.00,${end},Badge,,0,0,0,,{\\an5\\pos(518,1570)\\fsp3}${badgeText}`,
        `Dialogue: 1,0:00:00.00,${end},CTA,,0,0,0,,{\\an5\\pos(555,1677)}${callToAction}`
    )

    return [
        '[Script Info]',
        'ScriptType: v4.00+',
        'PlayResX: 1080',
        'PlayResY: 1920',
        'WrapStyle: 2',
        'ScaledBorderAndShadow: yes',
        'YCbCr Matrix: None',
        '',
        '[V4+ Styles]',
        'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
        'Style: Shadow,Oswald,92,&H00000000,&H00000000,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,8,0,0,0,1',
        'Style: Title,Oswald,92,&H00EEF2F5,&H00EEF2F5,&H00000000,&H00000000,1,0,0,0,100,100,1,0,1,0,0,8,0,0,0,1',
        'Style: Meta,PT Sans,36,&HB8EEF2F5,&HB8EEF2F5,&H00000000,&H00000000,0,0,0,0,100,100,5,0,1,0,0,5,0,0,0,1',
        'Style: Badge,Oswald,54,&H00EEF2F5,&H00EEF2F5,&H00000000,&H00000000,0,0,0,0,100,100,3,0,1,0,0,5,0,0,0,1',
        'Style: CTA,PT Sans,34,&HD1EEF2F5,&HD1EEF2F5,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1',
        '',
        '[Events]',
        'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text',
        ...events
    ].join('\n')
}

const getVideoDuration = async (inputPath: string) => {
    try {
        const {stdout} = await execFileAsync(
            process.env.FFPROBE_PATH || 'ffprobe',
            [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                inputPath
            ],
            {
                timeout: 10_000,
                maxBuffer: 1024 * 1024
            }
        )

        const duration = Number(stdout.trim())

        if (Number.isFinite(duration) && duration > 0) {
            return duration
        }

    } catch (error: any) {
        if (error?.code !== 'ENOENT') {
            console.warn('[REEL FFPROBE FALLBACK]', error?.message || error)
        }
    }

    // ffmpeg-static normally ships without ffprobe. Its input probe prints the
    // duration in stderr without decoding/encoding the whole video.
    if (!ffmpegPath) {
        throw new Error('[DECORATE] ffmpeg-static binary not found')
    }

    let probeOutput = ''

    try {
        await execFileAsync(
            ffmpegPath,
            ['-hide_banner', '-i', inputPath],
            {
                timeout: 10_000,
                maxBuffer: 2 * 1024 * 1024
            }
        )
    } catch (error: any) {
        probeOutput = String(error?.stderr || '')
    }

    const match = probeOutput.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)

    if (!match) {
        throw new Error(`[DECORATE] Could not determine video duration: ${inputPath}`)
    }

    const duration = Number(match[1]) * 3600
        + Number(match[2]) * 60
        + Number(match[3])

    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(`[DECORATE] Invalid video duration: ${inputPath}`)
    }

    return duration
}

const verifyFonts = (fontsDirectory: string) => {
    const requiredFonts = [
        'Oswald-Bold.ttf',
        'Oswald-SemiBold.ttf',
        'PTSans-Regular.ttf'
    ]

    const missing = requiredFonts.filter(
        filename => !existsSync(path.join(fontsDirectory, filename))
    )

    if (missing.length) {
        throw new Error(
            `[DECORATE] Missing required font file(s) in ${fontsDirectory}: ${missing.join(', ')}`
        )
    }
}

const escapeXml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

const ensureFontConfig = async (fontsDirectory: string, configDirectory: string): Promise<string> => {
    const fontConfigPath = path.join(configDirectory, 'fonts.conf')
    const fontCacheDirectory = path.join(
        configDirectory,
        'fontconfig-cache'
    )

    await mkdir(configDirectory, {recursive: true})
    await mkdir(fontCacheDirectory, {recursive: true})

    const config = [
        '<?xml version="1.0"?>',
        '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">',
        '<fontconfig>',
        `  <dir>${escapeXml(fontsDirectory)}</dir>`,
        `  <cachedir>${escapeXml(fontCacheDirectory)}</cachedir>`,
        '</fontconfig>',
        ''
    ].join('\n')

    await writeFile(fontConfigPath, config, 'utf8')

    console.log('[DECORATE FONTCONFIG READY]', {
        fontConfigPath,
        fontsDirectory,
        fontCacheDirectory
    })

    return fontConfigPath
}

export const decorateInstagramVideo = async (inputPath: string, keyTrailer: string, hook: string, options: DecorateInstagramVideoOptions = {}) => {
    if (!ffmpegPath) {
        throw new Error('[DECORATE] ffmpeg-static binary not found')
    }

    const outputPath = path.join(
        path.dirname(inputPath),
        `${keyTrailer}_${randomUUID()}_reel.mp4`
    )

    const fontsDirectory = path.join(process.cwd(), 'public', 'instagram', 'fonts')
    verifyFonts(fontsDirectory)

    const assets = await ensureReelOverlayAssets()
    const fontConfigPath = await ensureFontConfig(fontsDirectory, path.dirname(assets.static))
    const duration = await getVideoDuration(inputPath)
    const templateAssPath = path.join(
        path.dirname(inputPath),
        `${keyTrailer}_${randomUUID()}_template.ass`
    )
    const subtitleAssPath = options.subtitlesPath
        ? path.join(path.dirname(inputPath), `${keyTrailer}_${randomUUID()}_subtitles.ass`)
        : undefined

    const startedAt = Date.now()

    try {
        await writeFile(
            templateAssPath,
            createTemplateAss(duration, options, hook),
            'utf8'
        )

        if (options.subtitlesPath && subtitleAssPath) {
            const subtitleAss = await createSubtitleAss(
                options.subtitlesPath,
                duration,
                options.highlightWord
            )

            await writeFile(subtitleAssPath, subtitleAss, 'utf8')
        }

        const filterParts: string[] = []
        let currentVideoLabel = '0:v'

        // Layer 5: optional film subtitles.
        if (subtitleAssPath) {
            filterParts.push(
                `[${currentVideoLabel}]ass=filename='${escapeFilterPath(subtitleAssPath)}':fontsdir='${escapeFilterPath(fontsDirectory)}'[withSubtitles]`
            )
            currentVideoLabel = 'withSubtitles'
        }

        // Layer 6: progress track and animated red progress.
        filterParts.push(
            `[${currentVideoLabel}]drawbox=x=0:y=1406:w=1080:h=8:color=white@0.22:t=fill[progressTrack]`,
            '[2:v]format=rgba[progressSource]',
            `[progressTrack][progressSource]overlay=x='-w+w*t/${duration.toFixed(3)}':y=1406:shortest=1[withProgress]`
        )

        // Layer 7: static graphics, then the text belonging to that layer.
        filterParts.push(
            '[withProgress][1:v]overlay=0:0:eof_action=repeat:repeatlast=1[withStaticGraphics]',
            `[withStaticGraphics]ass=filename='${escapeFilterPath(templateAssPath)}':fontsdir='${escapeFilterPath(fontsDirectory)}',format=yuv420p[vout]`
        )

        const filterComplex = filterParts.join(';')

        await execFileAsync(
            ffmpegPath,
            [
                '-y',
                '-hide_banner',
                '-loglevel', 'error',
                '-filter_complex_threads', '1',
                '-filter_threads', '1',
                '-i', inputPath,
                '-i', assets.static,
                '-f', 'lavfi',
                '-i', `color=c=0x262626:s=1080x8:r=30:d=${duration.toFixed(3)}`,
                '-filter_complex', filterComplex,
                '-map', '[vout]',
                '-map', '0:a?',
                '-t', duration.toFixed(3),
                '-r', '30',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '20',
                '-threads', '1',
                '-profile:v', 'high',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '160k',
                '-ar', '48000',
                '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
                '-movflags', '+faststart',
                '-shortest',
                outputPath
            ],
            {
                timeout: 240_000,
                maxBuffer: 30 * 1024 * 1024,
                env: {
                    ...process.env,
                    FONTCONFIG_FILE: fontConfigPath,
                    FONTCONFIG_PATH: path.dirname(fontConfigPath)
                }
            }
        )

        console.log('[DECORATE INSTAGRAM VIDEO DONE]', {
            outputPath,
            durationSeconds: Number(duration.toFixed(3)),
            genre: options.genre ?? null,
            rating: options.rating ?? null,
            subtitles: Boolean(options.subtitlesPath),
            durationMs: Date.now() - startedAt
        })

    } catch (error: any) {
        console.error('[DECORATE INSTAGRAM VIDEO ERROR]', {
            inputPath,
            outputPath,
            durationMs: Date.now() - startedAt,
            message: error?.message,
            stderr: error?.stderr
        })
        await unlink(outputPath).catch(() => undefined)
        throw error

    } finally {
        await unlink(templateAssPath).catch(() => undefined)

        if (subtitleAssPath) {
            await unlink(subtitleAssPath).catch(() => undefined)
        }
    }

    return outputPath
}

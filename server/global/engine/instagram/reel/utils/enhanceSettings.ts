import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Цветокоррекция, лёгкое шумоподавление и резкость для clean 1080×1080.
 * Цепочка вставляется в filter_complex prepareInstagramVideo.ts после scale:
 *
 *   scale → hqdn3d (лёгкое шумоподавление) → eq (контраст, насыщенность, гамма) → cas (резкость)
 *
 * Резкость стоит последней, чтобы не усиливать шум и блочность сжатия YouTube.
 * Шумоподавление и резкость считаются на кадре 1080×1080, а не на исходных 4K:
 * в четыре раза меньше пикселей, на время сборки это почти не влияет.
 *
 * Всё настраивается без правки кода (переменные окружения, все необязательные):
 *   REEL_ENHANCE              off возвращает прежнее поведение: eq только для тёмных исходников
 *                             (gamma 1.25, contrast 1.1, saturation 1.1), без шумоподавления и резкости
 *   REEL_GRADE_CONTRAST       0.8–1.5, по умолчанию 1.06 (тёмные исходники 1.12)
 *   REEL_GRADE_SATURATION     0.5–2, по умолчанию 1.12 (тёмные исходники 1.15)
 *   REEL_GRADE_DARK_GAMMA     0.5–2.5, по умолчанию 1.25, только для тёмных исходников (средняя яркость < 110)
 *   REEL_DENOISE_STRENGTH     0–6, по умолчанию 1.2; 0 отключает шумоподавление
 *   REEL_SHARPEN              0–1, по умолчанию 0.4 (сила cas); 0 или off отключает резкость
 *
 * Фильтры cas и hqdn3d берутся из того ffmpeg, который собирает ролик (ffmpeg-static). Если какого-то
 * фильтра в нём нет, он пропускается (вместо cas ставится unsharp), и это видно в логе [REEL ENHANCE].
 */

export const DARK_SOURCE_LUMA = 110

export type EnhanceResult = {
    /** Фрагмент filter_complex, начинающийся с запятой, либо пустая строка. */
    chain: string
    applied: string[]
    skipped: string[]
    settings: Record<string, number | string | boolean>
}

const isOff = (value: string | undefined) =>
    ['off', '0', 'false', 'no'].includes((value ?? '').trim().toLowerCase())

const readNumber = (name: string, fallback: number, min: number, max: number) => {
    const raw = process.env[name]
    const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

const fmt = (value: number) => String(Number(value.toFixed(3)))

let filterNamesCache: Map<string, Promise<Set<string>>> | undefined

/** Имена фильтров ffmpeg: один запрос на бинарник за время работы процесса. */
const listFilterNames = (binary: string): Promise<Set<string>> => {
    filterNamesCache ??= new Map()

    let cached = filterNamesCache.get(binary)

    if (!cached) {
        cached = execFileAsync(binary, ['-hide_banner', '-filters'], {
            timeout: 15_000,
            maxBuffer: 5 * 1024 * 1024
        })
            .then(({stdout}) => new Set(
                stdout
                    .split(/\r?\n/)
                    .map((line) => line.trim().split(/\s+/)[1])
                    .filter((name): name is string => Boolean(name))
            ))
            .catch(() => new Set<string>())

        filterNamesCache.set(binary, cached)
    }

    return cached
}

export const buildEnhanceFilters = async (
    ffmpegBinary: string,
    averageLuma: number
): Promise<EnhanceResult> => {
    const dark = averageLuma < DARK_SOURCE_LUMA

    if (isOff(process.env.REEL_ENHANCE)) {
        return {
            chain: dark ? ',eq=gamma=1.25:contrast=1.1:saturation=1.1' : '',
            applied: dark ? ['eq (прежний, только тёмные исходники)'] : [],
            skipped: ['REEL_ENHANCE=off'],
            settings: {enhance: false, dark}
        }
    }

    const names = await listFilterNames(ffmpegBinary)
    const applied: string[] = []
    const skipped: string[] = []
    const parts: string[] = []

    const contrast = readNumber('REEL_GRADE_CONTRAST', dark ? 1.12 : 1.06, 0.8, 1.5)
    const saturation = readNumber('REEL_GRADE_SATURATION', dark ? 1.15 : 1.12, 0.5, 2)
    const gamma = dark ? readNumber('REEL_GRADE_DARK_GAMMA', 1.25, 0.5, 2.5) : 1

    const denoise = readNumber('REEL_DENOISE_STRENGTH', 1.2, 0, 6)
    const sharpenRaw = process.env.REEL_SHARPEN
    const sharpen = isOff(sharpenRaw) ? 0 : readNumber('REEL_SHARPEN', 0.4, 0, 1)

    // 1. Лёгкое шумоподавление: убирает блочность и шум сжатия, облегчает два следующих кодирования.
    if (denoise > 0) {
        if (names.has('hqdn3d')) {
            parts.push(`hqdn3d=${fmt(denoise)}:${fmt(denoise * 0.8)}:${fmt(denoise * 2)}:${fmt(denoise * 2)}`)
            applied.push('hqdn3d')
        } else {
            skipped.push('hqdn3d (нет в этом ffmpeg)')
        }
    }

    // 2. Цветокоррекция. eq есть в любой сборке ffmpeg.
    parts.push(
        'eq=' +
        (gamma !== 1 ? `gamma=${fmt(gamma)}:` : '') +
        `contrast=${fmt(contrast)}:saturation=${fmt(saturation)}`
    )
    applied.push('eq')

    // 3. Резкость последней.
    if (sharpen > 0) {
        if (names.has('cas')) {
            parts.push(`cas=strength=${fmt(sharpen)}`)
            applied.push('cas')
        } else if (names.has('unsharp')) {
            // Запасной вариант: только яркость, сила пересчитана из силы cas.
            parts.push(`unsharp=5:5:${fmt(sharpen * 1.6)}:5:5:0`)
            applied.push('unsharp (вместо cas)')
            skipped.push('cas (нет в этом ffmpeg)')
        } else {
            skipped.push('cas и unsharp (нет в этом ffmpeg)')
        }
    }

    return {
        chain: `,${parts.join(',')}`,
        applied,
        skipped,
        settings: {
            enhance: true,
            dark,
            averageLuma: Number(averageLuma.toFixed(1)),
            contrast,
            saturation,
            gamma,
            denoise,
            sharpen
        }
    }
}

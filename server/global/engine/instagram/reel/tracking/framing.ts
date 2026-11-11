import {spawn} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'
import {detectFaces, FACE_INPUT_SIZE} from '#server/global/engine/instagram/reel/tracking/faceDetector'
import {
    filterConsistentLogos,
    findLogosInFrame,
    type LogoRect,
    unionLogo
} from '#server/global/engine/instagram/reel/tracking/logoDetector'

/**
 * Кадрирование квадрата внутри картинки без чёрных полос (запросы владельца 11.11).
 *
 * Один проход по фрагменту (ANALYSIS_FPS кадров в секунду, ширина до 640) даёт:
 * склейки (по распределению цветов, не по пикселям: движение и дождь его почти не
 * меняют), главное лицо каждого кадра (только для нарезок) и логотип канала по моментам.
 *
 * Нарезка (planTrackedWindow): квадрат на всю высоту картинки ездит по X.
 *  - План следится, только если крупное уверенное лицо есть хотя бы в половине его
 *    кадров; иначе — центр картинки (решение владельца).
 *  - Внутри плана камера стоит на медиане положения лица и едет медленно, только если
 *    человек ушёл больше чем на 20% квадрата.
 *  - Логотип: в каждый момент левый край квадрата правее логотипа; ограничение заранее
 *    распространяется на ±1 с, поэтому камера отъезжает до раскрытия и возвращается после.
 *  - Если места справа от логотипа нет — infeasible, вызывающий срезает верх.
 *
 * Трейлер (planCenterZoom): квадрат по центру. Если логотип заходит в квадрат, на это
 * время (±1 с, с плавным входом и выходом) кадр приближается под логотип (zoompan),
 * остальное время — полный квадрат.
 */

export type PictureRect = {x: number, y: number, w: number, h: number}

export type SegmentAnalysis = {
    /** Моменты от начала фрагмента, секунды. */
    times: number[]
    shots: number[]
    /** Центр главного лица по X в долях ширины картинки, или null. */
    faceCenters: Array<number | null>
    /** Подтверждённый логотип кадра (общая рамка), или null. */
    logos: Array<LogoRect | null>
    stats: {
        frames: number
        shots: number
        framesWithFaces: number
        framesWithLogo: number
    }
}

export const ANALYSIS_FPS = 4
const ANALYSIS_WIDTH = FACE_INPUT_SIZE

/** Расстояние между цветовыми гистограммами соседних кадров (0–1), выше — склейка. */
const CUT_HISTOGRAM_DISTANCE = 0.28
/** План короче этого сливается с предыдущим (ложные склейки на вспышках). */
const MIN_SHOT_SECONDS = 1
/** Лицо: уверенность и размер (доля высоты картинки). */
const FACE_MIN_SCORE = 0.75
const FACE_MIN_HEIGHT_SHARE = 0.1
/** План следится, если лицо есть хотя бы в этой доле его кадров. */
const SHOT_FACE_SHARE = 0.5
/** Камера внутри плана едет, только если лицо ушло больше чем на эту долю квадрата. */
const PAN_SPREAD_SHARE = 0.2
/** Скорость камеры при движении внутри плана: доля квадрата в секунду. */
const PAN_SPEED_SHARE = 0.3
/** Сглаживание: полуширина окна, секунды. */
const SMOOTH_SECONDS = 1
/** Логотип: запас справа и снизу, доля стороны квадрата. */
const LOGO_MARGIN_SHARE = 0.02
/** Камера и приближение готовятся к логотипу заранее и отпускают после, секунды. */
const LOGO_LEAD_SECONDS = 1
/** Длительность плавного входа и выхода приближения, секунды. */
const ZOOM_RAMP_SECONDS = 0.6

const toEven = (value: number) => Math.round(value / 2) * 2
const smoothstep = (r: number) => r * r * (3 - 2 * r)

const readFrames = async (
    inputPath: string,
    startSeconds: number,
    durationSeconds: number,
    rect: PictureRect
): Promise<{width: number, height: number, frames: Buffer[]}> => {
    if (!ffmpegPath) {
        throw new Error('[REEL FRAMING] ffmpeg-static binary not found')
    }

    const width = Math.min(ANALYSIS_WIDTH, toEven(rect.w))
    const height = Math.min(FACE_INPUT_SIZE, Math.max(2, toEven(rect.h * width / rect.w)))
    const frameBytes = width * height * 3

    const args = [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-ss', startSeconds.toFixed(3),
        '-t', durationSeconds.toFixed(3),
        '-i', inputPath,
        '-an', '-sn',
        '-vf', `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},fps=${ANALYSIS_FPS},scale=${width}:${height}:flags=area`,
        '-pix_fmt', 'bgr24', '-f', 'rawvideo', '-'
    ]

    return new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath as unknown as string, args, {stdio: ['ignore', 'pipe', 'pipe']})
        const frames: Buffer[] = []
        let pending: Buffer = Buffer.alloc(0)
        let stderr = ''
        const timer = setTimeout(() => child.kill('SIGKILL'), 240_000)

        child.stdout.on('data', (chunk: Buffer) => {
            pending = pending.length ? Buffer.concat([pending, chunk]) : chunk
            while (pending.length >= frameBytes) {
                frames.push(Buffer.from(pending.subarray(0, frameBytes)))
                pending = pending.subarray(frameBytes)
            }
        })
        child.stderr.on('data', (chunk: Buffer) => {
            stderr = (stderr + chunk.toString()).slice(-4000)
        })
        child.on('error', error => {
            clearTimeout(timer)
            reject(error)
        })
        child.on('close', code => {
            clearTimeout(timer)
            if (code === 0 || frames.length > 0) resolve({width, height, frames})
            else reject(new Error(`[REEL FRAMING] ffmpeg exited with ${code}: ${stderr}`))
        })
    })
}

/** Цветовая гистограмма кадра: 8×8×8 корзин по каждому 4-му пикселю, нормированная. */
const colorHistogram = (frame: Buffer, width: number, height: number): Float32Array => {
    const histogram = new Float32Array(512)
    let count = 0
    for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
            const o = (y * width + x) * 3
            histogram[((frame[o + 2]! >> 5) << 6) | ((frame[o + 1]! >> 5) << 3) | (frame[o]! >> 5)]!++
            count++
        }
    }
    for (let i = 0; i < 512; i++) histogram[i]! /= count || 1
    return histogram
}

/** 1 − пересечение гистограмм: 0 — одинаковое распределение цветов, 1 — ничего общего. */
const histogramDistance = (a: Float32Array, b: Float32Array) => {
    let intersection = 0
    for (let i = 0; i < 512; i++) intersection += Math.min(a[i]!, b[i]!)
    return 1 - intersection
}

/** Склейки: номер плана для каждого кадра; планы короче MIN_SHOT_SECONDS слиты с предыдущим. */
const detectShots = (histograms: Float32Array[]): number[] => {
    const starts = [0]
    for (let i = 1; i < histograms.length; i++) {
        if (histogramDistance(histograms[i - 1]!, histograms[i]!) > CUT_HISTOGRAM_DISTANCE) starts.push(i)
    }

    const minFrames = Math.max(1, Math.round(MIN_SHOT_SECONDS * ANALYSIS_FPS))
    const merged = [0]
    for (const start of starts.slice(1)) {
        if (start - merged[merged.length - 1]! >= minFrames) merged.push(start)
    }
    // Последний план тоже не короче минимума.
    if (merged.length > 1 && histograms.length - merged[merged.length - 1]! < minFrames) merged.pop()

    const shots: number[] = []
    let shot = 0
    for (let i = 0; i < histograms.length; i++) {
        if (shot + 1 < merged.length && i >= merged[shot + 1]!) shot++
        shots.push(shot)
    }
    return shots
}

export const analyzeSegment = async (
    inputPath: string,
    segment: {startSeconds: number, durationSeconds: number},
    picture: PictureRect,
    {withFaces}: {withFaces: boolean}
): Promise<SegmentAnalysis | null> => {
    const {width, height, frames} = await readFrames(inputPath, segment.startSeconds, segment.durationSeconds, picture)
    if (!frames.length) return null

    const shots = detectShots(frames.map(frame => colorHistogram(frame, width, height)))
    const logos = filterConsistentLogos(frames.map(frame => findLogosInFrame(frame, width, height, 'bgr')))
        .map(unionLogo)

    const faceCenters: Array<number | null> = []
    for (const frame of frames) {
        if (!withFaces) {
            faceCenters.push(null)
            continue
        }
        const face = (await detectFaces(frame, width, height))
            .filter(f => f.score >= FACE_MIN_SCORE && f.h >= height * FACE_MIN_HEIGHT_SHARE)
            .sort((a, b) => b.w * b.h - a.w * a.h)[0]
        faceCenters.push(face ? (face.x + face.w / 2) / width : null)
    }

    return {
        times: frames.map((_, i) => i / ANALYSIS_FPS),
        shots,
        faceCenters,
        logos,
        stats: {
            frames: frames.length,
            shots: (shots[shots.length - 1] ?? 0) + 1,
            framesWithFaces: faceCenters.filter(c => c !== null).length,
            framesWithLogo: logos.filter(l => l !== null).length
        }
    }
}

/**
 * Анализ сделан по картинке `from`; пересчитать доли на другую картинку `to` (после
 * исправления полос или обрезки под логотипом). Логотип, оказавшийся целиком выше
 * новой картинки, пропадает.
 */
export const remapAnalysis = (
    analysis: SegmentAnalysis,
    from: PictureRect,
    to: PictureRect
): SegmentAnalysis => {
    const mapX = (share: number) => (from.x + share * from.w - to.x) / to.w
    const mapY = (share: number) => (from.y + share * from.h - to.y) / to.h

    return {
        ...analysis,
        faceCenters: analysis.faceCenters.map(c => (c === null ? null : mapX(c))),
        logos: analysis.logos.map(logo => {
            if (!logo) return null
            const bottom = mapY(logo.bottom)
            const right = mapX(logo.right)
            if (bottom <= 0 || right <= 0) return null
            return {left: Math.max(0, mapX(logo.left)), right, top: Math.max(0, mapY(logo.top)), bottom}
        })
    }
}

/** Самый низкий край логотипа по фрагменту, доля высоты картинки (0 — логотипа нет). */
export const lowestLogoBottom = (analysis: SegmentAnalysis): number =>
    Math.max(0, ...analysis.logos.map(logo => logo?.bottom ?? 0))

const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor((sorted.length - 1) / 2)]!
}

const quantile = (values: number[], q: number) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]!
}

/** Скользящее среднее внутри каждого плана. */
const smoothWithinShots = (values: number[], shots: number[], radius: number) =>
    values.map((_, i) => {
        let sum = 0
        let count = 0
        for (let k = i - radius; k <= i + radius; k++) {
            if (k >= 0 && k < values.length && shots[k] === shots[i]) {
                sum += values[k]!
                count++
            }
        }
        return sum / count
    })

export type TrackPlan =
    | {feasible: true, lefts: number[], trackedShots: number}
    | {feasible: false, reason: string}

/**
 * Нарезка: левый край квадрата (пиксели относительно картинки) в каждый момент анализа.
 */
export const planTrackedWindow = (
    analysis: SegmentAnalysis,
    picture: PictureRect,
    side: number
): TrackPlan => {
    const {shots, faceCenters, logos, times} = analysis
    const maxLeft = Math.max(0, picture.w - side)
    const pictureCenter = picture.w / 2
    const radius = Math.max(1, Math.round(SMOOTH_SECONDS * ANALYSIS_FPS))
    const leadFrames = Math.round(LOGO_LEAD_SECONDS * ANALYSIS_FPS)

    // 1. Цель камеры (центр квадрата, пиксели картинки).
    const targets: number[] = new Array(times.length).fill(pictureCenter)
    let trackedShots = 0

    for (let first = 0; first < times.length;) {
        let last = first
        while (last + 1 < times.length && shots[last + 1] === shots[first]) last++

        const centers = faceCenters.slice(first, last + 1)
            .filter((c): c is number => c !== null)
            .map(c => c * picture.w)
        const shotLength = last - first + 1

        if (centers.length >= shotLength * SHOT_FACE_SHARE) {
            trackedShots++
            const spread = quantile(centers, 0.9) - quantile(centers, 0.1)

            if (spread <= side * PAN_SPREAD_SHARE) {
                // Человек на месте: камера стоит.
                targets.fill(median(centers), first, last + 1)
            } else {
                // Человек заметно ушёл: медленная проводка по сглаженному положению.
                const known = faceCenters.slice(first, last + 1).map(c => c === null ? null : c * picture.w)
                let fallback = median(centers)
                const filled = known.map(c => (c === null ? fallback : (fallback = c)))
                const maxStep = side * PAN_SPEED_SHARE / ANALYSIS_FPS
                let position = filled[0]!
                for (let i = 0; i < filled.length; i++) {
                    const offset = filled[i]! - position
                    position += Math.sign(offset) * Math.min(Math.abs(offset), maxStep)
                    targets[first + i] = position
                }
            }
        }

        first = last + 1
    }

    // 2. Ограничение логотипом: левый край квадрата правее логотипа (с запасом),
    //    заранее распространённое на ±LOGO_LEAD_SECONDS.
    const margin = side * LOGO_MARGIN_SHARE
    const rawMinLeft = logos.map(logo => (logo ? Math.ceil(logo.right * picture.w + margin) : 0))
    const minLeft = rawMinLeft.map((_, i) => {
        let value = 0
        for (let k = Math.max(0, i - leadFrames); k <= Math.min(rawMinLeft.length - 1, i + leadFrames); k++) {
            value = Math.max(value, rawMinLeft[k]!)
        }
        return value
    })

    const impossible = minLeft.findIndex(value => value > maxLeft)
    if (impossible >= 0) {
        return {
            feasible: false,
            reason: `logo leaves no room at ${times[impossible]!.toFixed(1)}s (needs left ≥ ${minLeft[impossible]}, max ${maxLeft})`
        }
    }

    const clampLeft = (left: number, i: number) => Math.max(minLeft[i]!, Math.min(maxLeft, left))

    // 3. Левый край, сглаживание внутри плана, снова ограничение (сглаженное среднее
    //    значений ≥ minLeft соседних моментов уже ≥ ограничения без запаса, но на всякий
    //    случай ограничиваем ещё раз).
    const lefts = targets.map((target, i) => clampLeft(target - side / 2, i))
    const smoothed = smoothWithinShots(lefts, shots, radius).map((left, i) => toEven(clampLeft(left, i)))

    return {feasible: true, lefts: smoothed, trackedShots}
}

/** Логотип заходит в квадрат по центру: сколько пикселей квадрата сверху он закрывает. */
const logoCutInCenterSquare = (logo: LogoRect, picture: PictureRect, side: number): number => {
    const squareLeft = (picture.w - side) / 2
    const squareTop = (picture.h - side) / 2
    const logoRight = logo.right * picture.w
    const logoBottom = logo.bottom * picture.h
    if (logoRight <= squareLeft || logoBottom <= squareTop) return 0
    return Math.ceil(logoBottom - squareTop + side * LOGO_MARGIN_SHARE)
}

export type ZoomInterval = {start: number, end: number, cutTop: number}

/**
 * Трейлер: интервалы, когда логотип заходит в центральный квадрат, и сколько сверху
 * квадрата нужно убрать. Пустой список — приближать не нужно.
 */
export const planCenterZoom = (
    analysis: SegmentAnalysis,
    picture: PictureRect,
    side: number
): ZoomInterval[] => {
    const step = 1 / ANALYSIS_FPS
    const intervals: ZoomInterval[] = []

    analysis.logos.forEach((logo, i) => {
        const cut = logo ? logoCutInCenterSquare(logo, picture, side) : 0
        if (!cut) return
        const time = analysis.times[i]!
        const last = intervals[intervals.length - 1]
        // Соседние моменты с логотипом — один интервал (пропуск до 1 с допустим).
        if (last && time - last.end <= 1 + 1e-6) {
            last.end = time + step
            last.cutTop = Math.max(last.cutTop, cut)
        } else {
            intervals.push({start: time, end: time + step, cutTop: cut})
        }
    })

    return intervals
}

/**
 * Фильтр zoompan для квадрата side×side: на интервалах приближение под логотип
 * (низ кадра на месте, сверху убирается cutTop), вход и выход плавные. На выходе
 * outSize×outSize с частотой fps.
 */
export const buildZoomFilter = (
    intervals: ZoomInterval[],
    side: number,
    outSize: number,
    fps: string
): string => {
    const terms = intervals.map(({start, end, cutTop}) => {
        const zoom = side / Math.max(1, side - cutTop)
        const a = (start - LOGO_LEAD_SECONDS).toFixed(3)
        const b = (end + LOGO_LEAD_SECONDS).toFixed(3)
        const ramp = ZOOM_RAMP_SECONDS.toFixed(3)
        // r = min(вход, выход) от 0 до 1; плавность — smoothstep.
        const r = `min(clip((it-${a})/${ramp},0,1),clip((${b}-it)/${ramp},0,1))`
        return `${(zoom - 1).toFixed(5)}*(${r})*(${r})*(3-2*(${r}))`
    })

    // 1 + max(t1, max(t2, … max(tn, 0))): интервалы не складываются, берётся наибольший.
    const zoom = `1+${terms.reduceRight((rest, term) => `max(${term},${rest})`, '0')}`
    // Кадр по центру по X, низ на месте (убирается верх).
    return `zoompan=z='${zoom}':x='(iw-iw/zoom)/2':y='ih-ih/zoom':d=1:s=${outSize}x${outSize}:fps=${fps}`
}

/** Положение квадрата в момент time по плану (интерполяция внутри плана, прыжок на склейке). */
const interpolate = (times: number[], values: number[], shots: number[], time: number) => {
    if (time <= times[0]!) return values[0]!
    for (let i = 0; i + 1 < times.length; i++) {
        if (time < times[i + 1]!) {
            if (shots[i] !== shots[i + 1]) return values[i]!
            const ratio = (time - times[i]!) / (times[i + 1]! - times[i]!)
            return values[i]! + (values[i + 1]! - values[i]!) * ratio
        }
    }
    return values[values.length - 1]!
}

/** Файл sendcmd для crop@track: левый край квадрата на каждом кадре выхода. */
export const writeTrackCommands = async (
    filePath: string,
    analysis: SegmentAnalysis,
    lefts: number[],
    outputFps: number,
    durationSeconds: number
): Promise<{firstX: number, minX: number, maxX: number}> => {
    const lines: string[] = []
    let minX = Infinity
    let maxX = -Infinity
    let previous: number | undefined
    const frameCount = Math.ceil(durationSeconds * outputFps) + 1

    for (let frame = 0; frame < frameCount; frame++) {
        const time = frame / outputFps
        const left = toEven(interpolate(analysis.times, lefts, analysis.shots, time))
        minX = Math.min(minX, left)
        maxX = Math.max(maxX, left)
        if (left !== previous) {
            lines.push(`${time.toFixed(4)} crop@track x ${left};`)
            previous = left
        }
    }

    await writeFile(filePath, lines.join('\n') + '\n')
    return {firstX: toEven(lefts[0] ?? 0), minX, maxX}
}

/** Логотип в готовом clean: подтверждённая общая рамка по кадрам, или null. */
export const findLogoInFrames = (
    frames: Buffer[],
    width: number,
    height: number
): LogoRect | null => {
    const confirmed = filterConsistentLogos(frames.map(frame => findLogosInFrame(frame, width, height, 'rgb')))
    return unionLogo(confirmed.flat())
}

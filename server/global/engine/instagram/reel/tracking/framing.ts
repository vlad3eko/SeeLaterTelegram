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
import {fastDecoderArgs} from '#server/global/engine/instagram/reel/utils/ffmpegDecoder'

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
 *  - Постоянный логотип канала (маленький «B»): левый край квадрата всегда правее него.
 *    Это постоянное ограничение, камера из-за логотипа не ездит.
 *  - Если места справа от «B» нет — infeasible, вызывающий срезает верх на весь ролик.
 *
 * Режим center (без слежения): квадрат по центру (правее «B», если тот в него заходит).
 * С 12.11 воркер у трейлеров тоже включает слежение (решение владельца).
 *
 * Приближение (planLogoZoom, оба режима) — ТОЛЬКО когда «B» раскрывается в плашку и
 * плашка заходит в квадрат там, где он стоит (решение владельца 12.11: «зум может
 * происходить только в одном случае»). На это время (±1 с, плавно) кадр приближается
 * под плашку (zoompan), остальное время — полный квадрат без зума.
 */

export type PictureRect = {x: number, y: number, w: number, h: number}

export type SegmentAnalysis = {
    /** Моменты от начала фрагмента, секунды. */
    times: number[]
    shots: number[]
    /**
     * Точное начало каждого плана, секунды (по всем кадрам, фильтр scdet). Отсчёты анализа
     * идут через 0,25 с; без точного времени квадрат после склейки до четверти секунды
     * стоял на позиции прошлого плана, а потом перескакивал (жалоба владельца 12.11).
     */
    shotStarts: number[]
    /**
     * Для каждого начала плана: true — плавный переход (шторка, наплыв; найден только по
     * смене цветов, резкой склейки нет). Камера на нём едет плавно, а не прыгает.
     */
    softStarts: boolean[]
    /** Центр главного лица по X в долях ширины картинки, или null. */
    faceCenters: Array<number | null>
    /** Подтверждённый логотип кадра (общая рамка), или null. */
    logos: Array<LogoRect | null>
    stats: {
        frames: number
        shots: number
        /** Границы, найденные только по смене цветов (scdet их не отметил). */
        shotsFromColorOnly: number
        framesWithFaces: number
        framesWithLogo: number
    }
}

/**
 * Кадров анализа в секунду. 6, а не 4: план от ~0,2 с получает свой кадр анализа
 * (в трейлерах много быстрых склеек).
 */
export const ANALYSIS_FPS = 6
/** Логотип канала стоит на одном месте хотя бы столько секунд (огонь и блики — нет). */
const LOGO_STILL_SECONDS = 1.5
const ANALYSIS_WIDTH = FACE_INPUT_SIZE

/** Расстояние между цветовыми гистограммами соседних кадров (0–1), выше — склейка. */
const CUT_HISTOGRAM_DISTANCE = 0.28
/**
 * Граница, найденная только по смене цветов (scdet её не отметил), не ближе этого к
 * предыдущей границе: так отсекаются вспышки. Точные склейки scdet принимаются всегда.
 */
const MIN_COLOR_SHOT_SECONDS = 0.5
/** Склейки scdet ближе этого друг к другу — одна склейка (берётся последняя). */
const CUT_MERGE_SECONDS = 0.1
/**
 * Несколько склеек scdet между двумя соседними кадрами анализа, а кадры по обе стороны
 * почти одинаковы по цвету — это вспышка (вход и выход), а не смена плана.
 */
const FLASH_HISTOGRAM_DISTANCE = 0.1
/**
 * Плавный переход (шторка, наплыв): камера переезжает к новому плану за это время,
 * по середине — граница. Резкий прыжок посреди шторки виден (12.11, тест 6, 4,2 с:
 * человек уже открылся, а квадрат ещё на месте прошлого плана).
 */
const SOFT_TRANSITION_SECONDS = 0.5
/** Порог точного поиска склеек ffmpeg scdet (оценка 0–100). */
const SCDET_THRESHOLD = 10
/** Лицо входит в группу, если его площадь не меньше этой доли площади главного. */
const GROUP_FACE_SHARE = 0.35
/** Группа центрируется, если её рамка не шире этой доли квадрата. */
const GROUP_FIT_SHARE = 0.85
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
/** Приближение начинается до раскрытия плашки и отпускает после, секунды. */
const LOGO_LEAD_SECONDS = 1
/** Плашка раскрыта: её правый край правее «B» больше чем на эту долю ширины картинки. */
const LOGO_EXPANDED_SHARE = 0.02
/** Раскрытие подтверждено хотя бы в стольких отсчётах анализа подряд (по интервалу). */
const ZOOM_MIN_SAMPLES = 2
/** Больше этой доли квадрата сверху приближением не убираем. */
const ZOOM_MAX_CUT_SHARE = 0.3
/** Длительность плавного входа и выхода приближения, секунды. */
const ZOOM_RAMP_SECONDS = 0.6

const toEven = (value: number) => Math.round(value / 2) * 2

/**
 * Один проход по фрагменту:
 * - кадры анализа примерно ANALYSIS_FPS в секунду С НАСТОЯЩИМ ВРЕМЕНЕМ каждого кадра.
 *   Раньше выборку делал фильтр fps, который округляет время кадра к сетке: кадр
 *   «1,25 с» на деле был кадром 1,293 с (уже новый план), и время склейки бралось по
 *   метке сетки — на кадр-два раньше настоящей (12.11, жалоба «передёргивание на смене
 *   плана»). Теперь select берёт настоящие кадры, showinfo сообщает их время;
 * - оценка scdet для КАЖДОГО кадра (metadata print), чтобы склейку, которую видно только
 *   по смене цветов, поставить на кадр с наибольшей оценкой, а не на кадр анализа.
 */
const readFrames = async (
    inputPath: string,
    startSeconds: number,
    durationSeconds: number,
    rect: PictureRect
): Promise<{
    width: number
    height: number
    frames: Buffer[]
    /** Время каждого кадра анализа от начала фрагмента, секунды. */
    frameTimes: number[]
    /** Оценка scdet (0–100) каждого кадра фрагмента. */
    scores: Array<{time: number, score: number}>
}> => {
    if (!ffmpegPath) {
        throw new Error('[REEL FRAMING] ffmpeg-static binary not found')
    }

    const width = Math.min(ANALYSIS_WIDTH, toEven(rect.w))
    const height = Math.min(FACE_INPUT_SIZE, Math.max(2, toEven(rect.h * width / rect.w)))
    const frameBytes = width * height * 3
    // Чуть меньше шага, чтобы при 24 к/с брался каждый 4-й кадр, а не через раз 4-й и 5-й.
    const step = (1 / ANALYSIS_FPS - 0.004).toFixed(4)

    const args = [
        '-hide_banner', '-loglevel', 'info', '-nostats', '-nostdin',
        '-ss', startSeconds.toFixed(3),
        '-t', durationSeconds.toFixed(3),
        ...await fastDecoderArgs(inputPath),
        '-i', inputPath,
        '-an', '-sn',
        '-filter_complex',
        // Уменьшаем один раз до разделения на ветки (4K в каждой ветке — лишняя работа).
        `[0:v]crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},scale=${width}:${height}:flags=area,split[a][b];` +
        `[a]select='isnan(prev_selected_t)+gte(t-prev_selected_t,${step})',showinfo[frames];` +
        `[b]scale=320:-2,scdet=threshold=${SCDET_THRESHOLD},metadata=mode=print:key=lavfi.scd.score,nullsink`,
        '-map', '[frames]',
        // Кадры отдаются как есть, без подгонки под частоту выхода.
        '-fps_mode', 'passthrough',
        '-pix_fmt', 'bgr24', '-f', 'rawvideo', '-'
    ]

    return new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath as unknown as string, args, {stdio: ['ignore', 'pipe', 'pipe']})
        const frames: Buffer[] = []
        const frameTimes: number[] = []
        const scores: Array<{time: number, score: number}> = []
        let pending: Buffer = Buffer.alloc(0)
        let stderr = ''
        let stderrLine = ''
        let scoreTime: number | undefined
        const timer = setTimeout(() => child.kill('SIGKILL'), 240_000)

        child.stdout.on('data', (chunk: Buffer) => {
            pending = pending.length ? Buffer.concat([pending, chunk]) : chunk
            while (pending.length >= frameBytes) {
                frames.push(Buffer.from(pending.subarray(0, frameBytes)))
                pending = pending.subarray(frameBytes)
            }
        })
        child.stderr.on('data', (chunk: Buffer) => {
            const text = chunk.toString()
            stderr = (stderr + text).slice(-4000)
            const lines = (stderrLine + text).split(/\r?\n/)
            stderrLine = lines.pop() ?? ''
            for (const line of lines) {
                if (line.includes('Parsed_showinfo')) {
                    const shown = line.match(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:\s*(-?[\d.]+)/)
                    if (shown) frameTimes.push(Number(shown[1]))
                    continue
                }
                if (line.includes('Parsed_metadata')) {
                    const frame = line.match(/pts_time:\s*(-?[\d.]+)/)
                    if (frame) {
                        scoreTime = Number(frame[1])
                        continue
                    }
                    const score = line.match(/lavfi\.scd\.score=([\d.]+)/)
                    if (score && scoreTime !== undefined) {
                        scores.push({time: scoreTime, score: Number(score[1])})
                        scoreTime = undefined
                    }
                }
            }
        })
        child.on('error', error => {
            clearTimeout(timer)
            reject(error)
        })
        child.on('close', code => {
            clearTimeout(timer)
            if (code !== 0 && frames.length === 0) {
                reject(new Error(`[REEL FRAMING] ffmpeg exited with ${code}: ${stderr}`))
                return
            }
            // Времена не совпали с кадрами (не тот вывод showinfo) — шаг выборки.
            const times = frameTimes.length === frames.length
                ? frameTimes
                : frames.map((_, i) => i / ANALYSIS_FPS)
            if (frameTimes.length !== frames.length) {
                console.warn('[REEL FRAMING] Frame times mismatch; using the sampling step', {
                    frames: frames.length,
                    times: frameTimes.length
                })
            }
            resolve({width, height, frames, frameTimes: times, scores})
        })
    })
}

/**
 * Центр кадра для группы людей (скриншот владельца 12.11: трое рядом, камера ушла на
 * самое крупное лицо). Берутся лица не меньше GROUP_FACE_SHARE площади главного; если
 * их общая рамка помещается в квадрат (с запасом), центр — середина группы, иначе —
 * главное лицо. 0 — лиц нет.
 */
const groupCenter = (faces: Array<{x: number, y: number, w: number, h: number}>, side: number): number => {
    const main = faces[0]
    if (!main) return 0

    const group = faces.filter(f => f.w * f.h >= main.w * main.h * GROUP_FACE_SHARE)
    const left = Math.min(...group.map(f => f.x))
    const right = Math.max(...group.map(f => f.x + f.w))

    return right - left <= side * GROUP_FIT_SHARE
        ? (left + right) / 2
        : main.x + main.w / 2
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

/**
 * Границы планов (время первого кадра нового плана) и номер плана каждого кадра анализа.
 * - Склейка scdet между двумя соседними кадрами анализа — граница ровно в её момент.
 *   Несколько склеек там, где кадры по обе стороны одинаковы по цвету, — вспышка.
 * - Смена цветов без склейки scdet — граница на кадре с наибольшей оценкой scdet между
 *   этими кадрами анализа, не ближе MIN_COLOR_SHOT_SECONDS к предыдущей границе.
 * Раньше граница бралась только по смене цветов (план «лицо — ответное лицо» в одной
 * комнате пропускался) и планы короче секунды сливались с соседним.
 */
const detectShots = (
    times: number[],
    histograms: Float32Array[],
    scores: Array<{time: number, score: number}>
): {shots: number[], shotStarts: number[], softStarts: boolean[], fromColorOnly: number} => {
    const cuts: number[] = []
    for (const {time, score} of scores) {
        if (score < SCDET_THRESHOLD) continue
        if (cuts.length && time - cuts[cuts.length - 1]! < CUT_MERGE_SECONDS) cuts[cuts.length - 1] = time
        else cuts.push(time)
    }

    const boundaries: number[] = []
    const soft: boolean[] = []
    let fromColorOnly = 0
    for (let i = 1; i < times.length; i++) {
        const from = times[i - 1]!
        const to = times[i]!
        const distance = histogramDistance(histograms[i - 1]!, histograms[i]!)
        const inside = cuts.filter(time => time > from + 1e-6 && time <= to + 1e-6)

        if (inside.length) {
            if (inside.length > 1 && distance < FLASH_HISTOGRAM_DISTANCE) continue
            boundaries.push(inside[inside.length - 1]!)
            soft.push(false)
        } else if (distance > CUT_HISTOGRAM_DISTANCE) {
            const previous = boundaries[boundaries.length - 1] ?? 0
            if (to - previous < MIN_COLOR_SHOT_SECONDS) continue
            const strongest = scores
                .filter(item => item.time > from + 1e-6 && item.time <= to + 1e-6)
                .reduce<{time: number, score: number} | undefined>((best, item) =>
                    !best || item.score > best.score ? item : best, undefined)
            boundaries.push(strongest?.time ?? to)
            soft.push(true)
            fromColorOnly++
        }
    }

    const shotStarts = [0, ...boundaries]
    const shots = times.map(time => {
        let shot = 0
        while (shot + 1 < shotStarts.length && time >= shotStarts[shot + 1]! - 1e-6) shot++
        return shot
    })
    return {shots, shotStarts, softStarts: [false, ...soft], fromColorOnly}
}

export const analyzeSegment = async (
    inputPath: string,
    segment: {startSeconds: number, durationSeconds: number},
    picture: PictureRect,
    {withFaces}: {withFaces: boolean}
): Promise<SegmentAnalysis | null> => {
    const {width, height, frames, frameTimes, scores} =
        await readFrames(inputPath, segment.startSeconds, segment.durationSeconds, picture)
    if (!frames.length) return null

    const times = frameTimes
    const {shots, shotStarts, softStarts, fromColorOnly} =
        detectShots(times, frames.map(frame => colorHistogram(frame, width, height)), scores)
    const logos = filterConsistentLogos(
        frames.map(frame => findLogosInFrame(frame, width, height, 'bgr')),
        {minFrameGap: Math.round(ANALYSIS_FPS * LOGO_STILL_SECONDS)}
    )
        .map(unionLogo)

    const faceCenters: Array<number | null> = []
    for (const frame of frames) {
        if (!withFaces) {
            faceCenters.push(null)
            continue
        }
        const faces = (await detectFaces(frame, width, height))
            .filter(f => f.score >= FACE_MIN_SCORE && f.h >= height * FACE_MIN_HEIGHT_SHARE)
            .sort((a, b) => b.w * b.h - a.w * a.h)
        faceCenters.push(groupCenter(faces, Math.min(width, height)) / width || null)
    }

    return {
        times,
        shots,
        shotStarts,
        softStarts,
        faceCenters,
        logos,
        stats: {
            frames: frames.length,
            shots: shotStarts.length,
            shotsFromColorOnly: fromColorOnly,
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

/**
 * Постоянный логотип канала (маленький «B») по фрагменту, доли картинки, или null.
 * Берётся нижняя пятая часть правых краёв: большую часть времени виден именно «B»,
 * раскрытая плашка короче.
 */
export const persistentLogo = (analysis: SegmentAnalysis): {right: number, bottom: number} | null => {
    const present = analysis.logos.filter((logo): logo is LogoRect => logo !== null)
    if (!present.length) return null
    return {
        right: quantile(present.map(logo => logo.right), 0.2),
        bottom: quantile(present.map(logo => logo.bottom), 0.5)
    }
}

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

/** Самый левый край квадрата, при котором постоянный логотип не попадает в кадр, пиксели. */
export const logoMinLeft = (analysis: SegmentAnalysis, picture: PictureRect, side: number): number => {
    const base = persistentLogo(analysis)
    return base ? Math.ceil(base.right * picture.w + side * LOGO_MARGIN_SHARE) : 0
}

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
    const {shots, faceCenters, times} = analysis
    const maxLeft = Math.max(0, picture.w - side)
    const pictureCenter = picture.w / 2
    const radius = Math.max(1, Math.round(SMOOTH_SECONDS * ANALYSIS_FPS))

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

    // 2. Постоянное ограничение логотипом: квадрат всегда правее «B». Раскрытие плашки
    //    камеру не двигает — на это время planLogoZoom даёт приближение.
    const minLeft = logoMinLeft(analysis, picture, side)
    if (minLeft > maxLeft) {
        return {feasible: false, reason: `logo leaves no room (needs left ≥ ${minLeft}, max ${maxLeft})`}
    }

    const clampLeft = (left: number) => Math.max(minLeft, Math.min(maxLeft, left))

    // 3. Левый край, сглаживание внутри плана, снова ограничение.
    const lefts = targets.map(target => clampLeft(target - side / 2))
    const smoothed = smoothWithinShots(lefts, shots, radius).map(left => toEven(clampLeft(left)))

    return {feasible: true, lefts: smoothed, trackedShots}
}

export type ZoomInterval = {start: number, end: number, cutTop: number}

/**
 * Интервалы, когда «B» раскрыт в плашку и плашка заходит в квадрат с левым краем
 * lefts[i] (пиксели картинки, по моменту анализа), и сколько сверху квадрата убрать.
 * Сам «B» приближения не вызывает никогда. Пустой список — приближать не нужно.
 */
export const planLogoZoom = (
    analysis: SegmentAnalysis,
    picture: PictureRect,
    side: number,
    lefts: number[]
): ZoomInterval[] => {
    const base = persistentLogo(analysis)
    if (!base) return []

    const step = 1 / ANALYSIS_FPS
    const squareTop = (picture.h - side) / 2
    const margin = side * LOGO_MARGIN_SHARE
    const maxCut = Math.floor(side * ZOOM_MAX_CUT_SHARE)
    const intervals: Array<ZoomInterval & {samples: number}> = []

    analysis.logos.forEach((logo, i) => {
        if (!logo || logo.right <= base.right + LOGO_EXPANDED_SHARE) return
        const logoRight = logo.right * picture.w
        const logoBottom = logo.bottom * picture.h
        if (logoRight + margin <= lefts[i]! || logoBottom <= squareTop) return

        const cutTop = Math.min(maxCut, Math.ceil(logoBottom - squareTop + margin))
        const time = analysis.times[i]!
        const last = intervals[intervals.length - 1]
        // Соседние моменты раскрытия — один интервал (пропуск до 1 с допустим).
        if (last && time - last.end <= 1 + 1e-6) {
            last.end = time + step
            last.cutTop = Math.max(last.cutTop, cutTop)
            last.samples++
        } else {
            intervals.push({start: time, end: time + step, cutTop, samples: 1})
        }
    })

    return intervals
        .filter(interval => interval.samples >= ZOOM_MIN_SAMPLES)
        .map(({start, end, cutTop}) => ({start, end, cutTop}))
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

/**
 * Положение квадрата в момент time по плану: внутри плана интерполяция между отсчётами,
 * на склейке прыжок ровно в момент начала нового плана (shotStarts), а не на следующем
 * отсчёте анализа.
 */
const interpolate = (analysis: SegmentAnalysis, values: number[], time: number) => {
    const {times, shots, shotStarts, softStarts} = analysis

    // Плавный переход: переезд между последним положением прошлого плана и первым
    // положением нового за SOFT_TRANSITION_SECONDS вокруг границы.
    const half = SOFT_TRANSITION_SECONDS / 2
    for (let shot = 1; shot < shotStarts.length; shot++) {
        const start = shotStarts[shot]!
        if (!softStarts[shot] || time <= start - half || time >= start + half) continue
        let before = -1
        for (let i = 0; i < shots.length; i++) if (shots[i]! < shot) before = i
        const after = shots.findIndex(value => value >= shot)
        if (before < 0 || after < 0) break
        const ratio = (time - (start - half)) / SOFT_TRANSITION_SECONDS
        const eased = ratio * ratio * (3 - 2 * ratio)
        return values[before]! + (values[after]! - values[before]!) * eased
    }

    if (time <= times[0]!) return values[0]!
    for (let i = 0; i + 1 < times.length; i++) {
        if (time < times[i + 1]!) {
            if (shots[i] !== shots[i + 1]) {
                const cut = shotStarts[shots[i + 1]!] ?? times[i + 1]!
                return time >= cut ? values[i + 1]! : values[i]!
            }
            const ratio = (time - times[i]!) / (times[i + 1]! - times[i]!)
            return values[i]! + (values[i + 1]! - values[i]!) * ratio
        }
    }
    return values[values.length - 1]!
}

/** Команда срабатывает на кадрах начиная с этого времени; положение берётся чуть позже. */
const COMMAND_LEAD_SECONDS = 0.002

/**
 * Файл sendcmd для crop@track: левый край квадрата по сетке кадров выхода и отдельная
 * команда ровно перед первым кадром каждого нового плана. Раньше команды шли только по
 * сетке 1/30 с: первый кадр нового плана (например, 1,293 с между командами 1,267 и
 * 1,300) показывался со старыми координатами, и на следующем кадре квадрат дёргался.
 * Каждая команда применяется к кадрам с временем ≥ своего; положение для неё берётся на
 * COMMAND_LEAD_SECONDS позже, поэтому команда сетки за миг до склейки уже ставит новое.
 */
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

    const eventTimes = [
        ...Array.from({length: frameCount}, (_, frame) => frame / outputFps),
        ...analysis.shotStarts
            // Плавные переходы идут по сетке кадров, отдельная команда нужна только склейке.
            .filter((start, shot) => start > 0 && start < durationSeconds && !analysis.softStarts[shot])
            .map(start => Math.max(0, start - COMMAND_LEAD_SECONDS))
    ].sort((a, b) => a - b)

    for (const time of eventTimes) {
        const left = toEven(interpolate(analysis, lefts, time + COMMAND_LEAD_SECONDS))
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

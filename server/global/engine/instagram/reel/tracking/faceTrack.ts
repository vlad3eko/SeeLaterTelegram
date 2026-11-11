import {spawn} from 'node:child_process'
import {writeFile} from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'
import {detectFaces, FACE_INPUT_SIZE, type FaceBox} from '#server/global/engine/instagram/reel/tracking/faceDetector'

/**
 * Слежение за лицом у нарезок (запрос владельца 11.11, шаг 1): камера смещается только
 * по X внутри картинки без полос и плашки, в каждом плане держит в центре главное лицо
 * (самое крупное). Обрезка по Y остаётся прежней. Трейлеры кадрируются по центру.
 *
 * 1. Один проход ffmpeg по фрагменту: TRACK_FPS кадров в секунду, ширина до 640.
 * 2. Склейки: резкая разница соседних кадров (средняя по уменьшенному серому кадру).
 * 3. Лица YuNet в каждом кадре; главное — самое крупное.
 * 4. В каждом плане: пропуски заполняются ближайшим найденным, затем камера ведётся
 *    с «мёртвой зоной» и ограничением скорости, затем сглаживается. На склейке —
 *    прыжок без проезда. План без лиц — центр картинки.
 */

export type PictureRect = {x: number, y: number, w: number, h: number}

export type FaceTrack = {
    /** Моменты от начала фрагмента, секунды. */
    times: number[]
    /** Центр камеры по X в пикселях исходника (абсолютные координаты кадра). */
    centers: number[]
    /** Номер плана для каждого момента: между планами камера прыгает, а не едет. */
    shots: number[]
    stats: {
        frames: number
        framesWithFaces: number
        shots: number
        shotsWithFaces: number
    }
}

const TRACK_FPS = 4
const ANALYSIS_WIDTH = FACE_INPUT_SIZE
/** Средняя разница серого между соседними кадрами (0–255), выше — склейка. */
const CUT_THRESHOLD = 28
/** Лицо меньше этой доли высоты кадра не считается (лица в толпе, ложные срабатывания). */
const MIN_FACE_HEIGHT_SHARE = 0.06
/** Камера стоит, пока центр лица в пределах этой доли стороны квадрата от центра кадра. */
const DEAD_ZONE_SHARE = 0.08
/** Наибольшая скорость камеры: доля стороны квадрата в секунду. */
const MAX_SPEED_SHARE = 0.6
/** Сглаживание: полуширина окна скользящего среднего, отсчётов (×1/TRACK_FPS с). */
const SMOOTH_RADIUS = 2

const toEven = (value: number) => Math.round(value / 2) * 2

/** Кадры BGR24 фрагмента одним проходом ffmpeg. */
const readFrames = async (
    inputPath: string,
    startSeconds: number,
    durationSeconds: number,
    rect: PictureRect
): Promise<{width: number, height: number, frames: Buffer[]}> => {
    if (!ffmpegPath) {
        throw new Error('[REEL FACE TRACK] ffmpeg-static binary not found')
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
        '-vf', `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},fps=${TRACK_FPS},scale=${width}:${height}:flags=area`,
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
            if (code === 0 || frames.length > 0) {
                resolve({width, height, frames})
            } else {
                reject(new Error(`[REEL FACE TRACK] ffmpeg exited with ${code}: ${stderr}`))
            }
        })
    })
}

/** Средняя абсолютная разница яркости двух кадров по сетке точек. */
const frameDifference = (a: Buffer, b: Buffer, width: number, height: number): number => {
    const step = 8
    let sum = 0
    let count = 0
    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const i = (y * width + x) * 3
            const lumaA = 0.114 * a[i]! + 0.587 * a[i + 1]! + 0.299 * a[i + 2]!
            const lumaB = 0.114 * b[i]! + 0.587 * b[i + 1]! + 0.299 * b[i + 2]!
            sum += Math.abs(lumaA - lumaB)
            count++
        }
    }
    return count ? sum / count : 0
}

const mainFace = (faces: FaceBox[], frameHeight: number): FaceBox | undefined =>
    faces
        .filter(face => face.h >= frameHeight * MIN_FACE_HEIGHT_SHARE)
        .sort((a, b) => b.w * b.h - a.w * a.h)[0]

/**
 * Камера внутри одного плана. targets — центр главного лица (в пикселях исходника)
 * или null; возвращает центр камеры для каждого отсчёта.
 */
const followWithinShot = (
    targets: Array<number | null>,
    pictureCenter: number,
    side: number
): number[] => {
    const known = targets
        .map((value, index) => ({value, index}))
        .filter((item): item is {value: number, index: number} => item.value !== null)

    if (!known.length) return targets.map(() => pictureCenter)

    // Пропуски (лицо отвернулось, моргнул детектор) — ближайшее найденное значение.
    const filled = targets.map((value, index) => {
        if (value !== null) return value
        let best = known[0]!
        for (const item of known) {
            if (Math.abs(item.index - index) < Math.abs(best.index - index)) best = item
        }
        return best.value
    })

    // Мёртвая зона и ограничение скорости: камера не дёргается за мелким движением.
    const deadZone = side * DEAD_ZONE_SHARE
    const maxStep = side * MAX_SPEED_SHARE / TRACK_FPS
    const camera: number[] = []
    let position = filled[0]!

    for (const target of filled) {
        const offset = target - position
        if (Math.abs(offset) > deadZone) {
            const move = Math.sign(offset) * Math.min(Math.abs(offset) - deadZone, maxStep)
            position += move
        }
        camera.push(position)
    }

    // Плавный старт и остановка: скользящее среднее внутри плана.
    return camera.map((_, index) => {
        let sum = 0
        let count = 0
        for (let k = index - SMOOTH_RADIUS; k <= index + SMOOTH_RADIUS; k++) {
            if (k >= 0 && k < camera.length) {
                sum += camera[k]!
                count++
            }
        }
        return sum / count
    })
}

/**
 * Траектория камеры по фрагменту. null — лиц не найдено ни в одном кадре (или
 * картинка не шире квадрата): тогда кадрирование обычное, по центру.
 */
export const trackMainFace = async (
    inputPath: string,
    segment: {startSeconds: number, durationSeconds: number},
    rect: PictureRect
): Promise<FaceTrack | null> => {
    const side = Math.min(rect.w, rect.h)
    if (rect.w - side < 4) return null

    const {width, height, frames} = await readFrames(inputPath, segment.startSeconds, segment.durationSeconds, rect)
    if (!frames.length) return null

    const scale = rect.w / width
    const pictureCenter = rect.x + rect.w / 2

    const shots: number[] = []
    const targets: Array<number | null> = []
    let shot = 0
    let framesWithFaces = 0

    for (let index = 0; index < frames.length; index++) {
        if (index > 0 && frameDifference(frames[index - 1]!, frames[index]!, width, height) > CUT_THRESHOLD) {
            shot++
        }
        shots.push(shot)

        const face = mainFace(await detectFaces(frames[index]!, width, height), height)
        if (face) framesWithFaces++
        targets.push(face ? rect.x + (face.x + face.w / 2) * scale : null)
    }

    if (!framesWithFaces) return null

    const centers: number[] = []
    let shotsWithFaces = 0
    for (let first = 0; first < targets.length;) {
        let last = first
        while (last + 1 < targets.length && shots[last + 1] === shots[first]) last++

        const shotTargets = targets.slice(first, last + 1)
        if (shotTargets.some(value => value !== null)) shotsWithFaces++
        centers.push(...followWithinShot(shotTargets, pictureCenter, side))

        first = last + 1
    }

    return {
        times: frames.map((_, index) => index / TRACK_FPS),
        centers,
        shots,
        stats: {frames: frames.length, framesWithFaces, shots: shot + 1, shotsWithFaces}
    }
}

/**
 * Файл команд sendcmd для фильтра `crop@track`: левый край квадрата (относительно
 * картинки rect) на каждом кадре выхода. Внутри плана — линейная интерполяция между
 * отсчётами, на склейке — прыжок в момент второго отсчёта.
 */
export const writeTrackCommands = async (
    filePath: string,
    track: FaceTrack,
    rect: PictureRect,
    side: number,
    outputFps: number,
    durationSeconds: number
): Promise<{firstX: number, minX: number, maxX: number}> => {
    const maxLeft = Math.max(0, rect.w - side)
    const leftAt = (center: number) =>
        Math.max(0, Math.min(maxLeft, toEven(center - rect.x - side / 2)))

    const centerAt = (time: number): number => {
        const {times, centers, shots} = track
        if (time <= times[0]!) return centers[0]!
        for (let i = 0; i + 1 < times.length; i++) {
            if (time < times[i + 1]!) {
                if (shots[i] !== shots[i + 1]) return centers[i]!
                const ratio = (time - times[i]!) / (times[i + 1]! - times[i]!)
                return centers[i]! + (centers[i + 1]! - centers[i]!) * ratio
            }
        }
        return centers[centers.length - 1]!
    }

    const lines: string[] = []
    let minX = Infinity
    let maxX = -Infinity
    let previous: number | undefined
    const frameCount = Math.ceil(durationSeconds * outputFps) + 1

    for (let frame = 0; frame < frameCount; frame++) {
        const time = frame / outputFps
        const left = leftAt(centerAt(time))
        minX = Math.min(minX, left)
        maxX = Math.max(maxX, left)
        if (left !== previous) {
            lines.push(`${time.toFixed(4)} crop@track x ${left};`)
            previous = left
        }
    }

    await writeFile(filePath, lines.join('\n') + '\n')
    return {firstX: leftAt(centerAt(0)), minX, maxX}
}

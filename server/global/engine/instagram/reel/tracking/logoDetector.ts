/**
 * Логотип канала в левом верхнем углу кадра (запрос владельца 11.11). Пример: красный
 * квадрат «B» (по X 5–9%, по Y 7,8–15,2% кадра 16:9), который раз в минуту на ~6 с
 * раскрывается в плашку «THE BOXOFFICE NETWORK» до 29% ширины. Логотип не обязан
 * касаться края кадра.
 *
 * В одном кадре логотип — связная область насыщенного цвета одного оттенка, вместе
 * с надписью внутри (белые буквы) заполняющая свой прямоугольник почти целиком:
 * - рамка в левой части (левый край левее 40% ширины) и в верхней (верх выше 30%);
 * - высота 2–25% кадра, ширина 2–60% (финальная заставка во весь кадр не логотип);
 * - цвет плюс надпись не меньше 70% рамки, самого цвета не меньше 30%.
 * По набору кадров (filterConsistentLogos) остаются только рамки, которые повторяются
 * на одном месте по высоте хотя бы в двух кадрах: случайный красный предмет в сцене
 * так не держится.
 */

export type LogoRect = {
    /** Доли ширины и высоты анализируемой картинки, 0–1. */
    left: number
    right: number
    top: number
    bottom: number
}

const REGION_RIGHT = 0.6
const REGION_BOTTOM = 0.35
const MAX_LEFT = 0.4
const MAX_TOP = 0.3
const MIN_HEIGHT = 0.02
const MAX_HEIGHT = 0.25
const MIN_WIDTH = 0.02
const MAX_WIDTH = 0.6
const MIN_FILL = 0.7
const MIN_BASE = 0.3
const HUE_TOLERANCE = 22
/** Одна и та же полоса логотипа в разных кадрах: верх и низ совпадают с этим допуском. */
const BAND_TOLERANCE = 0.02

export type PixelOrder = 'rgb' | 'bgr'

const hueOf = (r: number, g: number, b: number): number => {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    if (max < 90 || delta < 0.5 * max) return -1

    let hue: number
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4

    hue *= 60
    return hue < 0 ? hue + 360 : hue
}

const hueDistance = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360
    return d > 180 ? 360 - d : d
}

const isLettering = (r: number, g: number, b: number) =>
    Math.min(r, g, b) >= 170 && Math.max(r, g, b) - Math.min(r, g, b) <= 60

/** Логотипы в одном кадре (обычно один или ни одного). */
export const findLogosInFrame = (
    frame: Buffer,
    width: number,
    height: number,
    order: PixelOrder = 'rgb'
): LogoRect[] => {
    const regionW = Math.max(1, Math.floor(width * REGION_RIGHT))
    const regionH = Math.max(1, Math.floor(height * REGION_BOTTOM))
    const ri = order === 'rgb' ? 0 : 2
    const bi = order === 'rgb' ? 2 : 0

    const pixel = (x: number, y: number) => {
        const o = (y * width + x) * 3
        return [frame[o + ri]!, frame[o + 1]!, frame[o + bi]!] as const
    }

    // Оттенок каждого пикселя области (или -1), один раз.
    const hues = new Float32Array(regionW * regionH)
    for (let y = 0; y < regionH; y++) {
        for (let x = 0; x < regionW; x++) {
            const [r, g, b] = pixel(x, y)
            hues[y * regionW + x] = hueOf(r, g, b)
        }
    }

    const visited = new Uint8Array(regionW * regionH)
    const logos: LogoRect[] = []
    const stack: number[] = []

    for (let start = 0; start < hues.length; start++) {
        if (visited[start] || hues[start]! < 0) continue

        // Связная область одного оттенка (4-связность).
        const seedHue = hues[start]!
        let minX = regionW, maxX = -1, minY = regionH, maxY = -1, area = 0
        stack.push(start)
        visited[start] = 1

        while (stack.length) {
            const index = stack.pop()!
            const x = index % regionW
            const y = (index - x) / regionW
            area++
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y

            const neighbours = [
                x > 0 ? index - 1 : -1,
                x + 1 < regionW ? index + 1 : -1,
                y > 0 ? index - regionW : -1,
                y + 1 < regionH ? index + regionW : -1
            ]
            for (const next of neighbours) {
                if (next < 0 || visited[next]) continue
                const hue = hues[next]!
                if (hue >= 0 && hueDistance(hue, seedHue) <= HUE_TOLERANCE) {
                    visited[next] = 1
                    stack.push(next)
                }
            }
        }

        const boxW = maxX - minX + 1
        const boxH = maxY - minY + 1
        if (
            boxW < width * MIN_WIDTH || boxW > width * MAX_WIDTH ||
            boxH < height * MIN_HEIGHT || boxH > height * MAX_HEIGHT ||
            minX > width * MAX_LEFT || minY > height * MAX_TOP
        ) {
            continue
        }

        // Заполнение рамки: цвет логотипа плюс белая надпись внутри.
        let lettering = 0
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const hue = hues[y * regionW + x]!
                if (hue >= 0 && hueDistance(hue, seedHue) <= HUE_TOLERANCE) continue
                const [r, g, b] = pixel(x, y)
                if (isLettering(r, g, b)) lettering++
            }
        }

        const boxArea = boxW * boxH
        if (area / boxArea < MIN_BASE || (area + lettering) / boxArea < MIN_FILL) continue

        logos.push({
            left: minX / width,
            right: (maxX + 1) / width,
            top: minY / height,
            bottom: (maxY + 1) / height
        })
    }

    return logos
}

/**
 * Оставляет только рамки, чья полоса по высоте (верх и низ) повторяется хотя бы
 * в двух кадрах набора. Возвращает по кадру список подтверждённых рамок.
 */
export const filterConsistentLogos = (perFrame: LogoRect[][]): LogoRect[][] => {
    const all = perFrame.flatMap((logos, frame) => logos.map(logo => ({logo, frame})))

    const confirmed = (candidate: {logo: LogoRect, frame: number}) =>
        all.some(other =>
            other.frame !== candidate.frame &&
            Math.abs(other.logo.top - candidate.logo.top) <= BAND_TOLERANCE &&
            Math.abs(other.logo.bottom - candidate.logo.bottom) <= BAND_TOLERANCE
        )

    return perFrame.map((logos, frame) =>
        logos.filter(logo => confirmed({logo, frame}))
    )
}

/** Общая рамка нескольких логотипов кадра (или null). */
export const unionLogo = (logos: LogoRect[]): LogoRect | null =>
    logos.length
        ? {
            left: Math.min(...logos.map(l => l.left)),
            right: Math.max(...logos.map(l => l.right)),
            top: Math.min(...logos.map(l => l.top)),
            bottom: Math.max(...logos.map(l => l.bottom))
        }
        : null

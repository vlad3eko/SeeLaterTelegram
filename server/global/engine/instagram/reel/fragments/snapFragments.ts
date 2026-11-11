import {
    FRAGMENT_MAX_SECONDS,
    FRAGMENT_MIN_SECONDS,
    FRAGMENT_TARGET_SECONDS,
    FRAGMENTS_MAX
} from '#server/global/engine/instagram/reel/fragments/types'

/**
 * Подгонка границ фрагмента, предложенных Gemini (его таймкоды приблизительные: он видит
 * видео примерно кадр в секунду), к настоящим границам исходника.
 *
 * - Начало: ближайшая склейка в пределах SNAP_WINDOW — фрагмент начинается ровно с неё
 *   (запаса не берём: секунда до склейки — это кадр чужого плана, «рваное» начало).
 *   Иначе конец паузы (начало реплики) с запасом LEAD секунды назад, иначе исходное
 *   время с тем же запасом; запас не заходит за предыдущую склейку.
 * - Конец: ближайшая склейка — ровно на ней; иначе начало паузы (конец реплики) с запасом
 *   LEAD вперёд, не заходя за следующую склейку.
 * - Длина: 40–60 с (цель — минута). Длиннее — конец переносится на последнюю границу
 *   не дальше максимума; короче — на первую границу не раньше минимума.
 */

export type SourceBoundaries = {
    duration: number
    /** Точные склейки, секунды (по возрастанию). */
    cuts: number[]
    /** Паузы в звуке. */
    silences: Array<{start: number, end: number}>
}

export type RawFragment = {start: number, end: number}

const SNAP_WINDOW = 2
const LEAD = 1

const nearest = (values: number[], target: number, window: number): number | undefined => {
    let best: number | undefined
    for (const value of values) {
        if (Math.abs(value - target) <= window && (best === undefined || Math.abs(value - target) < Math.abs(best - target))) {
            best = value
        }
    }
    return best
}

const lastBefore = (values: number[], time: number) =>
    values.filter(v => v < time).at(-1)

const firstAfter = (values: number[], time: number) =>
    values.find(v => v > time)

export const snapFragment = (raw: RawFragment, source: SourceBoundaries): RawFragment => {
    const {duration, cuts, silences} = source
    const speechStarts = silences.map(s => s.end)
    const speechEnds = silences.map(s => s.start)

    // Начало.
    let start: number
    const cutStart = nearest(cuts, raw.start, SNAP_WINDOW)
    if (cutStart !== undefined) {
        start = cutStart
    } else {
        const speech = nearest(speechStarts, raw.start, SNAP_WINDOW) ?? raw.start
        const previousCut = lastBefore(cuts, speech) ?? 0
        start = Math.max(previousCut, speech - LEAD)
    }
    start = Math.max(0, start)

    // Конец по предложению модели.
    const snapEnd = (target: number): number => {
        const cutEnd = nearest(cuts, target, SNAP_WINDOW)
        if (cutEnd !== undefined) return cutEnd
        const speech = nearest(speechEnds, target, SNAP_WINDOW) ?? target
        const nextCut = firstAfter(cuts, speech) ?? duration
        return Math.min(nextCut, speech + LEAD, duration)
    }

    let end = snapEnd(raw.end)

    // Длина 40–60 с: переносим конец на подходящую границу.
    const boundaries = [...cuts, ...speechEnds].filter(t => t > start).sort((a, b) => a - b)
    const maxEnd = Math.min(duration, start + FRAGMENT_MAX_SECONDS)
    const minEnd = Math.min(duration, start + FRAGMENT_MIN_SECONDS)

    if (end > maxEnd) {
        end = boundaries.filter(t => t >= minEnd && t <= maxEnd).at(-1) ?? maxEnd
    } else if (end < minEnd) {
        // Короче минимума: ближайшая граница к цели (минуте), не раньше минимума.
        const target = Math.min(duration, start + FRAGMENT_TARGET_SECONDS)
        const fitting = boundaries.filter(t => t >= minEnd && t <= maxEnd)
        end = fitting.length
            ? fitting.reduce((best, t) => (Math.abs(t - target) < Math.abs(best - target) ? t : best))
            : minEnd
    }

    return {start: round(start), end: round(Math.min(end, duration))}
}

const round = (value: number) => Math.round(value * 100) / 100

// Почти тот же вариант: начало и конец совпадают с точностью до NEAR_SAME секунд.
// Перекрытие само по себе не повод отбрасывать: перекрывающиеся варианты с другим
// началом или концом — это разные версии нарезки (решение владельца 12.11).
const NEAR_SAME = 6
const nearlySame = (a: RawFragment, b: RawFragment) =>
    Math.abs(a.start - b.start) < NEAR_SAME && Math.abs(a.end - b.end) < NEAR_SAME

/**
 * Подгоняет все фрагменты, отбрасывает слишком короткие (короче 20 с после подгонки,
 * например в конце ролика) и почти совпадающие с уже принятыми (начало и конец ближе
 * NEAR_SAME секунд), сохраняет порядок модели (лучшие первыми), не больше FRAGMENTS_MAX.
 */
export const snapFragments = <T extends RawFragment>(fragments: T[], source: SourceBoundaries): T[] => {
    const accepted: T[] = []
    for (const fragment of fragments) {
        if (!(fragment.end > fragment.start)) continue
        const snapped = {...fragment, ...snapFragment(fragment, source)}
        if (snapped.end - snapped.start < 20) continue
        if (accepted.some(other => nearlySame(other, snapped))) continue
        accepted.push(snapped)
        if (accepted.length >= FRAGMENTS_MAX) break
    }
    return accepted
}

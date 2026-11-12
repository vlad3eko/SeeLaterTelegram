import {
    FRAGMENT_MAX_SECONDS,
    FRAGMENT_MIN_SECONDS,
    FRAGMENT_TARGET_SECONDS,
    FRAGMENTS_MAX
} from '#server/global/engine/instagram/reel/fragments/types'
import {blockAt, type Dialogue, type DialogueBlock, lineAt} from '#server/global/engine/instagram/reel/fragments/dialogue'

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
 *
 * С расшифровкой (dialogue.ts, запрос владельца 12.11 «фраза договорена — и сразу конец,
 * хотя разговор продолжается») границы ставятся по смыслу:
 * - Начало не посреди реплики: если оно внутри разговора, начавшегося не раньше чем за
 *   START_BACK секунд, — на начало разговора, иначе на начало реплики. Склейка берётся,
 *   только если она не режет реплику.
 * - Конец — только на конце разговора (блока диалога), последняя реплика не вопрос.
 *   Если разговор, где модель хотела закончить, не помещается в 60 с от начала, начало
 *   переносится позже, на начало другого разговора: конец не обрывается. Если ни один
 *   разговор не подходит — конец законченного предложения (не вопроса).
 *   Хвост: до склейки после разговора (смена плана или места), если она близко, иначе
 *   до секунды тишины.
 */

export type SourceBoundaries = {
    duration: number
    /** Точные склейки, секунды (по возрастанию). */
    cuts: number[]
    /** Паузы в звуке. */
    silences: Array<{start: number, end: number}>
    /** Реплики и блоки диалога (null — расшифровки нет). */
    dialogue?: Dialogue | null
}

export type RawFragment = {start: number, end: number}

const SNAP_WINDOW = 2
const LEAD = 1
/** Начало внутри разговора: насколько далеко назад можно перенести его на начало разговора. */
const START_BACK = 10
/** Хвост после конца разговора: до склейки, если она не дальше, иначе секунда тишины. */
const TAIL_CUT_WINDOW = 1.5
const TAIL_SECONDS = 1
/** Разговор, кончающийся вопросом, можно закончить только при такой тишине после него. */
const ENDABLE_QUESTION_GAP = 6
/** Перенос начала: конец разговора не дальше этого от предложенного моделью конца. */
const RESTART_END_WINDOW = 20
/** Перенос начала дороже, чем сдвиг конца в пределах длины (секунды «стоимости»). */
const RESTART_PENALTY = 5
/** Начало с реплики посреди сцены: только после паузы не короче этой. */
const RESTART_LINE_GAP = 1
/** Насколько фрагмент по концу речи может быть короче минимума (хвост добавится). */
const LENGTH_SLACK = 1.5

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

/** Подгонка по расшифровке: начало не посреди реплики, конец на конце разговора. */
const snapByDialogue = (raw: RawFragment, source: SourceBoundaries, dialogue: Dialogue): RawFragment => {
    const {duration, cuts} = source
    const {lines, blocks} = dialogue
    const freeCut = (cut: number) => !lineAt(lines, cut)
    const isQuestion = (index: number) => /\?["»]?$/.test(lines[index]?.text ?? '')

    /** Начало не посреди реплики; склейка чуть раньше речи (не режет реплику) — ровно с неё. */
    const snapStart = (time: number, allowBack: boolean): number => {
        let start = time
        const block = blockAt(blocks, time)
        const line = lineAt(lines, time)
        if (allowBack && block && time - block.start <= START_BACK) start = block.start
        else if (line) start = line.start
        const previousLineEnd = lines.filter(l => l.end <= start + 0.05).at(-1)?.end ?? 0
        const cutBefore = cuts
            .filter(cut => cut <= start + 0.05 && cut >= Math.max(previousLineEnd, start - SNAP_WINDOW) && freeCut(cut))
            .at(-1)
        if (cutBefore !== undefined) start = cutBefore
        else if (!block && !line) {
            const cutNear = nearest(cuts.filter(freeCut), time, SNAP_WINDOW)
            if (cutNear !== undefined) start = cutNear
        }
        return Math.max(0, start)
    }

    // Где разговор можно закончить: конец блока, последняя реплика не вопрос (вопрос ждёт
    // ответа), кроме случая, когда после него долгая тишина.
    const endable = blocks.filter(block => !isQuestion(block.lastLine) || block.gapAfter >= ENDABLE_QUESTION_GAP)
    // Длина по концу речи: хвост (до секунды) добавится потом, поэтому минимум мягче.
    const lengthOk = (from: number, to: number) =>
        to - from >= Math.min(FRAGMENT_MIN_SECONDS, duration - from) - LENGTH_SLACK && to - from <= FRAGMENT_MAX_SECONDS + 0.01

    type Option = {start: number, block: DialogueBlock, cost: number}
    const options: Option[] = []
    const start = snapStart(raw.start, true)

    // А. Начало как есть, конец — на конце разговора в пределах длины. Если модель
    // поставила конец внутри разговора — конец этого разговора дешевле остальных.
    const containing = blockAt(blocks, raw.end)
    for (const block of endable) {
        if (block.end <= start || !lengthOk(start, block.end)) continue
        const inside = containing === block ? -3 : 0
        options.push({start, block, cost: Math.abs(block.end - raw.end) + inside})
    }

    // Б. Разговор, на котором модель хотела закончить, не помещается в 60 с от начала:
    // начало переносится позже — на начало другого разговора, а если такого нет, на начало
    // реплики после законченного предложения и паузы (дороже). Конец не обрывается.
    const restartPoints: Array<{time: number, penalty: number}> = [
        ...blocks.map(block => ({time: block.start, penalty: RESTART_PENALTY})),
        ...lines
            .map((line, index) => ({line, previous: lines[index - 1]}))
            .filter(({line, previous}) => previous && previous.complete && line.start - previous.end >= RESTART_LINE_GAP)
            .map(({line}) => ({time: line.start, penalty: RESTART_PENALTY * 2}))
    ]
    for (const block of endable) {
        if (Math.abs(block.end - raw.end) > RESTART_END_WINDOW) continue
        for (const point of restartPoints) {
            if (point.time >= block.end || !lengthOk(point.time, block.end)) continue
            const restart = snapStart(point.time, false)
            options.push({
                start: restart,
                block,
                cost: Math.abs(block.end - raw.end) + Math.abs(restart - raw.start) + point.penalty
            })
        }
    }

    const best = options.reduce<Option | undefined>((choice, option) =>
        choice === undefined || option.cost < choice.cost ? option : choice, undefined)

    let finalStart = start
    let speechEnd: number | undefined
    let gapAfter = 0
    if (best) {
        finalStart = best.start
        speechEnd = best.block.end
        gapAfter = best.block.gapAfter
    } else {
        // Ни один разговор не кончается в нужной длине: конец законченного предложения
        // (не вопроса), ближайший к предложению модели.
        const sentences = lines
            .map((line, index) => ({line, index}))
            .filter(({line, index}) => line.complete && !isQuestion(index) && lengthOk(start, line.end))
        // Чем длиннее пауза после предложения, тем вероятнее, что мысль закончена.
        const gapOf = (index: number) => (lines[index + 1]?.start ?? duration) - lines[index]!.end
        const cost = (item: typeof sentences[number]) => Math.abs(item.line.end - raw.end) - 2 * Math.min(gapOf(item.index), 4)
        const sentence = sentences.reduce<typeof sentences[number] | undefined>((choice, item) =>
            choice === undefined || cost(item) < cost(choice) ? item : choice, undefined)
        if (sentence) {
            speechEnd = sentence.line.end
            const next = lines[sentence.index + 1]
            gapAfter = (next ? next.start : duration) - sentence.line.end
        }
    }

    if (speechEnd === undefined) {
        // Речи в нужном отрезке нет (сцена без слов): прежняя подгонка по склейкам и паузам.
        return snapBySignals({start, end: raw.end}, source, start)
    }

    // Хвост: до склейки после разговора (смена плана или места), иначе до секунды тишины.
    const room = Math.max(0, gapAfter - 0.15)
    const cutAfter = cuts.find(cut => cut > speechEnd! && cut <= speechEnd! + Math.min(room, TAIL_CUT_WINDOW))
    const end = cutAfter ?? speechEnd + Math.min(room, TAIL_SECONDS)

    return {start: round(finalStart), end: round(Math.min(end, duration))}
}

export const snapFragment = (raw: RawFragment, source: SourceBoundaries): RawFragment =>
    source.dialogue?.lines.length
        ? snapByDialogue(raw, source, source.dialogue)
        : snapBySignals(raw, source)

/** Подгонка без расшифровки: склейки и паузы в звуке. */
const snapBySignals = (raw: RawFragment, source: SourceBoundaries, fixedStart?: number): RawFragment => {
    const {duration, cuts, silences} = source
    const speechStarts = silences.map(s => s.end)
    const speechEnds = silences.map(s => s.start)

    // Начало.
    let start: number
    const cutStart = nearest(cuts, raw.start, SNAP_WINDOW)
    if (fixedStart !== undefined) {
        start = fixedStart
    } else if (cutStart !== undefined) {
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

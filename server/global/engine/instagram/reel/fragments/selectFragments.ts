import {GoogleGenAI} from '@google/genai'
import {hookModels} from '#server/global/engine/instagram/reel/utils/generateInstagramHookFromVideo'
import {
    type ClipFragment,
    formatClock,
    FRAGMENT_MAX_SECONDS,
    FRAGMENT_MIN_SECONDS,
    FRAGMENT_TARGET_SECONDS,
    FRAGMENTS_MAX
} from '#server/global/engine/instagram/reel/fragments/types'
import type {SourceIndex} from '#server/global/engine/instagram/reel/fragments/sourceIndex'
import {
    type Dialogue,
    formatBlockEnds,
    formatLines
} from '#server/global/engine/instagram/reel/fragments/dialogue'

/**
 * Gemini смотрит всю нарезку (лёгкая копия) и предлагает до 8 законченных фрагментов
 * для Reels. Время он выбирает, опираясь на переданный список склеек и пауз; код потом
 * подгоняет границы точно (snapFragments.ts). Лучшие — первыми.
 *
 * Если есть расшифровка (dialogue.ts), Gemini получает реплики с таймкодами и места, где
 * разговор закончен, и выбирает границы по сюжету. Затем отдельный текстовый запрос
 * (reviewFragmentStory) проверяет каждый фрагмент: понятно ли начало, закончен ли
 * разговор в конце, не обрывается ли сюжетная линия — и предлагает исправленные границы.
 */

const FILE_PROCESSING_TIMEOUT_MS = 180_000
const REQUEST_TIMEOUT_MS = 180_000
const ROUNDS = 2
const ROUND_PAUSE_MS = 15_000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const listTimes = (values: number[], max: number) =>
    values.slice(0, max).map(t => t.toFixed(1)).join(', ')

/** Блок промпта с репликами (пусто, если расшифровки нет). */
const dialogueSection = (dialogue: Dialogue | null | undefined): string => {
    if (!dialogue?.lines.length) return ''
    return `
Реплики фильма по времени (секунды от начала ролика; S1, S2 — разные говорящие):
${formatLines(dialogue.lines.slice(0, 600))}

Где разговор закончен (конец последней реплики разговора и тишина после неё):
${formatBlockEnds(dialogue.blocks.slice(0, 300)) || 'не найдено'}

Как выбирать границы по репликам:
- пройди по сюжетной линии фрагмента от первой реплики до последней: зритель должен понять, кто говорит и о чём, и получить ответ или развязку;
- фрагмент не заканчивается, пока разговор продолжается: если на реплику следует ответ, реакция или продолжение мысли — они входят во фрагмент; конец ставь только на одно из мест «где разговор закончен»;
- последняя реплика — смысловая точка: после неё можно поставить точку (ответ получен, решение принято, угроза прозвучала, шутка досказана), а не вопрос, оставшийся без ответа, и не начало новой темы;
- начало — первая реплика разговора или действие перед ней, а не середина разговора;
- смена места действия или долгая пауза после реплики — хороший признак конца сцены.
`
}

export const buildFragmentsPrompt = (
    context: {title?: string, overview?: string},
    index: Pick<SourceIndex, 'duration' | 'cuts' | 'silences' | 'dialogue'>
): string => `
Ты — монтажёр коротких вертикальных роликов о кино (Instagram Reels). Перед тобой нарезка из фильма длиной ${formatClock(index.duration)} (${index.duration.toFixed(0)} с).

Фильм: ${context.title || 'не указан'}
Описание: ${context.overview || 'не указано'}

Задача: предложи ровно ${FRAGMENTS_MAX} вариантов фрагмента, каждый из которых сам по себе станет хорошим роликом (если ролик короче полутора минут — сколько получится).

Каждый фрагмент:
- длина ${FRAGMENT_MIN_SECONDS}–${FRAGMENT_MAX_SECONDS} секунд, лучше около ${FRAGMENT_TARGET_SECONDS};
- законченный момент: зрителю понятно, что происходит, есть нарастание и развязка или обрыв на самом интересном;
- сильное начало: в первые 2–3 секунды уже действие, реплика или напряжение, а не проход по коридору;
- не начинается и не заканчивается посреди фразы и посреди разговора;
- варианты МОГУТ перекрываться: это разные версии нарезки одного и того же материала — с другим началом, другой кульминацией или другим концом; начало каждого варианта отличается от начала остальных минимум на 8 секунд;
- сначала самые сильные, но покажи и смелые альтернативы: администратор выбирает сам.

Опорные точки исходника (секунды). Начало фрагмента ставь на склейку или конец паузы, конец — на склейку или начало паузы:
Склейки: ${listTimes(index.cuts, 400) || 'не найдены'}
Паузы (начало–конец): ${index.silences.slice(0, 300).map(s => `${s.start.toFixed(1)}–${s.end.toFixed(1)}`).join(', ') || 'не найдены'}
${dialogueSection(index.dialogue)}
Ответь строго JSON без пояснений вокруг, фрагменты от лучшего к худшему:
{"fragments": [{"start": 12.4, "end": 70.1, "title": "до 6 слов по-русски", "reason": "одна короткая фраза по-русски: чем цепляет"}]}
`.trim()

/** JSON из ответа модели (бывает обёрнут в ```json ... ```). */
export const parseFragmentsResponse = (raw: string, duration: number): ClipFragment[] => {
    const text = raw.replace(/```(?:json)?/gi, '').trim()
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first < 0 || last <= first) return []

    let parsed: unknown
    try {
        parsed = JSON.parse(text.slice(first, last + 1))
    } catch {
        return []
    }

    const items = (parsed as {fragments?: unknown})?.fragments
    if (!Array.isArray(items)) return []

    return items
        .map(item => item as Record<string, unknown>)
        .map(item => ({
            start: Number(item.start),
            end: Number(item.end),
            title: String(item.title ?? '').trim().slice(0, 80),
            reason: String(item.reason ?? '').trim().slice(0, 200)
        }))
        .filter(f => Number.isFinite(f.start) && Number.isFinite(f.end) && f.start >= 0 && f.end > f.start && f.start < duration)
}

type InteractionResult = {id?: string, status?: string, output_text?: string}

/** Запрос к первой ответившей модели из hookModels(): текст и, если есть, видео. */
const askModels = async (
    ai: GoogleGenAI,
    input: unknown[],
    interactionIds: string[],
    label: string,
    accept: (text: string, model: string, durationMs: number) => boolean,
    {models = hookModels(), thinking = 'low'}: {models?: string[], thinking?: 'low' | 'medium' | 'high'} = {}
): Promise<string> => {
    let lastError: unknown
    // Второй круг по моделям после паузы: всплески «high demand» (503) у Gemini временные
    // (12.11 при проверке обе модели подряд отказывали, через минуту отвечали).
    for (let round = 0; round < ROUNDS; round++) {
    if (round > 0) await sleep(ROUND_PAUSE_MS)
    for (const model of models) {
        const startedAt = Date.now()
        try {
            const interaction = await ai.interactions.create(
                {model, generation_config: {thinking_level: thinking}, input} as never,
                {
                    timeout_ms: REQUEST_TIMEOUT_MS,
                    retries: {
                        strategy: 'backoff',
                        backoff: {initialInterval: 1_000, maxInterval: 5_000, exponent: 2, maxElapsedTime: 20_000},
                        retryConnectionErrors: true
                    },
                    retry_codes: ['503']
                } as never
            ) as InteractionResult

            if (interaction.id) interactionIds.push(interaction.id)
            if (interaction.status !== 'completed') {
                throw new Error(`${label} Interaction ended with status ${interaction.status}`)
            }
            const text = String(interaction.output_text ?? '')
            if (!accept(text, model, Date.now() - startedAt)) throw new Error(`${label} No usable answer`)
            return text
        } catch (error) {
            lastError = error
            console.warn(`${label} Attempt failed`, {model, round, message: error instanceof Error ? error.message : String(error)})
        }
    }
    }
    throw lastError ?? new Error(`${label} No model answered`)
}

const jsonObject = (raw: string): unknown => {
    const text = raw.replace(/```(?:json)?/gi, '').trim()
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')
    if (first < 0 || last <= first) return null
    try {
        return JSON.parse(text.slice(first, last + 1))
    } catch {
        return null
    }
}

/**
 * Проверка сюжета (текстовый запрос, без видео): для каждого фрагмента модель видит его
 * реплики плюс реплики до и после и решает, законченный ли это кусок истории. Возвращает
 * фрагменты с исправленными границами (их ещё раз подгоняет snapFragments).
 */
export const buildStoryReviewPrompt = (
    fragments: ClipFragment[],
    dialogue: Dialogue,
    context: {title?: string, overview?: string}
): string => {
    const items = fragments.map((fragment, index) => `
### Фрагмент ${index + 1}: ${fragment.start.toFixed(1)}–${fragment.end.toFixed(1)} с («${fragment.title}»)
До фрагмента:
${formatLines(dialogue.lines, fragment.start - 20, fragment.start) || '(нет реплик)'}
Внутри фрагмента:
${formatLines(dialogue.lines, fragment.start, fragment.end) || '(нет реплик)'}
После фрагмента:
${formatLines(dialogue.lines, fragment.end, fragment.end + 30) || '(нет реплик)'}`).join('\n')

    return `
Ты — редактор коротких роликов о кино. Проверь, что каждый фрагмент нарезки — законченный кусок истории.

Фильм: ${context.title || 'не указан'}
Описание: ${context.overview || 'не указано'}

Для каждого фрагмента пройди по репликам от начала до конца:
1. Начало: зрителю понятно, о чём разговор? Если фрагмент начинается с ответа на реплику, которая осталась «до фрагмента», — начало нужно перенести раньше, на начало разговора.
2. Конец: разговор закончен? Если «после фрагмента» сразу (в пределах пары секунд) идёт ответ, реакция или продолжение той же мысли — конец обрывает диалог и его нужно перенести на конец разговора. Последняя реплика должна быть смысловой точкой.
3. Длина фрагмента после исправления — от ${FRAGMENT_MIN_SECONDS} до ${FRAGMENT_MAX_SECONDS} секунд. Если законченный разговор в эту длину не укладывается, сдвинь начало позже (на начало другого разговора), но не обрывай конец.

Границы бери из времён реплик: начало — время начала реплики, конец — время конца реплики.
${items}

Ответь строго JSON без пояснений вокруг:
{"fragments": [{"n": 1, "ok": true, "start": 12.4, "end": 70.1, "problem": "коротко по-русски, что не так (пусто, если ok)"}]}
`.trim()
}

/** Модели проверки сюжета: REEL_STORY_MODELS или сначала gemini-3.8-flash, затем модели хука. */
const storyModels = (): string[] => {
    const configured = (process.env.REEL_STORY_MODELS ?? '').split(',').map(name => name.trim()).filter(Boolean)
    return [...new Set(configured.length ? configured : ['gemini-3.8-flash', ...hookModels()])]
}

export const reviewFragmentStory = async (
    fragments: ClipFragment[],
    dialogue: Dialogue,
    context: {title?: string, overview?: string}
): Promise<ClipFragment[]> => {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey || !fragments.length || !dialogue.lines.length) return fragments

    const ai = new GoogleGenAI({apiKey})
    const interactionIds: string[] = []
    try {
        let parsed: Array<Record<string, unknown>> = []
        await askModels(
            ai,
            [{type: 'text', text: buildStoryReviewPrompt(fragments, dialogue, context)}],
            interactionIds,
            '[REEL FRAGMENTS STORY]',
            text => {
                const items = (jsonObject(text) as {fragments?: unknown})?.fragments
                parsed = Array.isArray(items) ? items.map(item => item as Record<string, unknown>) : []
                return parsed.length > 0
            },
            // Здесь нужна внимательность к репликам, а не видео: запрос текстовый и дешёвый,
            // поэтому сначала сильная модель с рассуждением.
            {models: storyModels(), thinking: 'medium'}
        )

        const reviewed = fragments.map((fragment, index) => {
            const verdict = parsed.find(item => Number(item.n) === index + 1)
            if (!verdict || verdict.ok === true) return fragment
            const start = Number(verdict.start)
            const end = Number(verdict.end)
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return fragment
            return {...fragment, start, end}
        })

        console.log('[REEL FRAGMENTS STORY] Review', parsed.map(item =>
            `${item.n}: ${item.ok === true ? 'ok' : `${Number(item.start).toFixed(1)}–${Number(item.end).toFixed(1)} ${String(item.problem ?? '')}`}`))
        return reviewed
    } catch (error) {
        console.warn('[REEL FRAGMENTS STORY] Review failed; keeping fragments', {
            message: error instanceof Error ? error.message : String(error)
        })
        return fragments
    } finally {
        for (const id of interactionIds) {
            await ai.interactions.delete(id).catch(() => undefined)
        }
    }
}

export const requestFragmentsFromGemini = async (
    index: SourceIndex,
    context: {title?: string, overview?: string}
): Promise<ClipFragment[]> => {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
        throw new Error('[REEL FRAGMENTS] GEMINI_API_KEY is missing')
    }

    const ai = new GoogleGenAI({apiKey})
    let uploadedName: string | undefined
    const interactionIds: string[] = []

    try {
        const uploaded = await ai.files.upload({file: index.proxyPath, config: {mimeType: 'video/mp4'}})
        uploadedName = uploaded.name
        if (!uploaded.name) throw new Error('[REEL FRAGMENTS] File upload returned no name')

        const deadline = Date.now() + FILE_PROCESSING_TIMEOUT_MS
        let file = await ai.files.get({name: uploaded.name})
        while (file.state !== 'ACTIVE') {
            if (file.state === 'FAILED') throw new Error('[REEL FRAGMENTS] Gemini video processing failed')
            if (Date.now() > deadline) throw new Error('[REEL FRAGMENTS] Gemini video processing timeout')
            await sleep(3_000)
            file = await ai.files.get({name: uploaded.name})
        }
        if (!file.uri) throw new Error('[REEL FRAGMENTS] Processed video has no URI')

        let fragments: ClipFragment[] = []
        await askModels(
            ai,
            [
                {type: 'video', uri: file.uri, mime_type: file.mimeType || 'video/mp4'},
                {type: 'text', text: buildFragmentsPrompt(context, index)}
            ],
            interactionIds,
            '[REEL FRAGMENTS]',
            (text, model, durationMs) => {
                fragments = parseFragmentsResponse(text, index.duration)
                console.log('[REEL FRAGMENTS] Gemini answer', {
                    model,
                    durationMs,
                    fragments: fragments.map(f => `${f.start.toFixed(1)}–${f.end.toFixed(1)} ${f.title}`)
                })
                return fragments.length > 0
            }
        )
        return fragments

    } finally {
        for (const id of interactionIds) {
            await ai.interactions.delete(id).catch(() => undefined)
        }
        if (uploadedName) {
            await ai.files.delete({name: uploadedName}).catch(() => undefined)
        }
    }
}

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

/**
 * Gemini смотрит всю нарезку (лёгкая копия) и предлагает до 8 законченных фрагментов
 * для Reels. Время он выбирает, опираясь на переданный список склеек и пауз; код потом
 * подгоняет границы точно (snapFragments.ts). Лучшие — первыми.
 */

const FILE_PROCESSING_TIMEOUT_MS = 180_000
const REQUEST_TIMEOUT_MS = 180_000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const listTimes = (values: number[], max: number) =>
    values.slice(0, max).map(t => t.toFixed(1)).join(', ')

export const buildFragmentsPrompt = (
    context: {title?: string, overview?: string},
    index: Pick<SourceIndex, 'duration' | 'cuts' | 'silences'>
): string => `
Ты — монтажёр коротких вертикальных роликов о кино (Instagram Reels). Перед тобой нарезка из фильма длиной ${formatClock(index.duration)} (${index.duration.toFixed(0)} с).

Фильм: ${context.title || 'не указан'}
Описание: ${context.overview || 'не указано'}

Задача: найди до ${FRAGMENTS_MAX} разных фрагментов, каждый из которых сам по себе станет хорошим роликом.

Каждый фрагмент:
- длина ${FRAGMENT_MIN_SECONDS}–${FRAGMENT_MAX_SECONDS} секунд, лучше около ${FRAGMENT_TARGET_SECONDS};
- законченный момент: зрителю понятно, что происходит, есть нарастание и развязка или обрыв на самом интересном;
- сильное начало: в первые 2–3 секунды уже действие, реплика или напряжение, а не проход по коридору;
- не начинается и не заканчивается посреди фразы;
- фрагменты не повторяют друг друга (допустимо небольшое перекрытие).

Опорные точки исходника (секунды). Начало фрагмента ставь на склейку или конец паузы, конец — на склейку или начало паузы:
Склейки: ${listTimes(index.cuts, 400) || 'не найдены'}
Паузы (начало–конец): ${index.silences.slice(0, 300).map(s => `${s.start.toFixed(1)}–${s.end.toFixed(1)}`).join(', ') || 'не найдены'}

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

        const prompt = buildFragmentsPrompt(context, index)
        let lastError: unknown

        for (const model of hookModels()) {
            const startedAt = Date.now()
            try {
                const interaction = await ai.interactions.create(
                    {
                        model,
                        generation_config: {thinking_level: 'low'},
                        input: [
                            {type: 'video', uri: file.uri, mime_type: file.mimeType || 'video/mp4'},
                            {type: 'text', text: prompt}
                        ]
                    } as never,
                    {
                        timeout_ms: REQUEST_TIMEOUT_MS,
                        retries: {
                            strategy: 'backoff',
                            backoff: {initialInterval: 1_000, maxInterval: 5_000, exponent: 2, maxElapsedTime: 20_000},
                            retryConnectionErrors: true
                        },
                        retry_codes: ['503']
                    } as never
                ) as {id?: string, status?: string, output_text?: string}

                if (interaction.id) interactionIds.push(interaction.id)
                if (interaction.status !== 'completed') {
                    throw new Error(`[REEL FRAGMENTS] Interaction ended with status ${interaction.status}`)
                }

                const fragments = parseFragmentsResponse(String(interaction.output_text ?? ''), index.duration)
                console.log('[REEL FRAGMENTS] Gemini answer', {
                    model,
                    durationMs: Date.now() - startedAt,
                    fragments: fragments.map(f => `${f.start.toFixed(1)}–${f.end.toFixed(1)} ${f.title}`)
                })

                if (!fragments.length) throw new Error('[REEL FRAGMENTS] No usable fragments in the answer')
                return fragments

            } catch (error) {
                lastError = error
                console.warn('[REEL FRAGMENTS] Attempt failed', {
                    model,
                    message: error instanceof Error ? error.message : String(error)
                })
            }
        }

        throw lastError ?? new Error('[REEL FRAGMENTS] No model answered')

    } finally {
        for (const id of interactionIds) {
            await ai.interactions.delete(id).catch(() => undefined)
        }
        if (uploadedName) {
            await ai.files.delete({name: uploadedName}).catch(() => undefined)
        }
    }
}

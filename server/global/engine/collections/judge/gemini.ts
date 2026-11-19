import {GoogleGenAI} from '@google/genai'
import type {AskModel} from '#server/global/engine/collections/judge/judge'

/**
 * Модель судьи — Gemini (ключ GEMINI_API_KEY, как у Reels). Модели по порядку из
 * COLLECTION_JUDGE_MODELS (через запятую), иначе flash-lite → flash.
 *
 * Бесплатный уровень (проверено 19.11.2026): у gemini-3.8-flash 5 запросов в минуту и 20 в день,
 * поэтому первой идёт flash-lite, а запросы идут не чаще COLLECTION_JUDGE_RPM в минуту
 * (по умолчанию 10). Модель, у которой кончился дневной лимит, до конца запуска пропускается.
 * Взаимодействия удаляются сразу после ответа (не копятся в аккаунте).
 */

const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash']
const TIMEOUT_MS = 120_000

export const judgeModels = (env: NodeJS.ProcessEnv = process.env) => {
    const configured = String(env.COLLECTION_JUDGE_MODELS ?? '').split(',').map(model => model.trim()).filter(Boolean)
    return configured.length ? configured : DEFAULT_MODELS
}

type InteractionResult = {id?: string, status?: string, output_text?: string}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Лимит «в день» исчерпан (а не «в минуту»). */
export const isDailyLimit = (message: string) => /per day|perday|daily/i.test(message)

export const geminiJudge = (apiKey = process.env.GEMINI_API_KEY?.trim()): AskModel => {
    if (!apiKey) throw new Error('[BUNDLES] GEMINI_API_KEY is missing')
    const ai = new GoogleGenAI({apiKey})
    const models = judgeModels()
    const rpm = Math.max(1, Number(process.env.COLLECTION_JUDGE_RPM) || 10)
    const gapMs = Math.ceil(60_000 / rpm)
    const exhausted = new Set<string>()
    // Очередь запросов: следующий — не раньше чем через gapMs после предыдущего.
    let nextAt = 0
    const slot = async () => {
        const wait = Math.max(0, nextAt - Date.now())
        nextAt = Math.max(Date.now(), nextAt) + gapMs
        if (wait) await sleep(wait)
    }

    return async (prompt: string) => {
        let lastError: unknown
        for (let round = 0; round < 3; round++) {
            if (round) await sleep(30_000)
            for (const model of models) {
                if (exhausted.has(model)) continue
                let id: string | undefined
                try {
                    await slot()
                    const interaction = await ai.interactions.create(
                        {model, generation_config: {thinking_level: 'low'}, input: [{type: 'text', text: prompt}]} as never,
                        {
                            timeout_ms: TIMEOUT_MS,
                            retries: {
                                strategy: 'backoff',
                                backoff: {initialInterval: 2_000, maxInterval: 10_000, exponent: 2, maxElapsedTime: 30_000},
                                retryConnectionErrors: true
                            },
                            retry_codes: ['503']
                        } as never
                    ) as InteractionResult
                    id = interaction.id
                    if (interaction.status !== 'completed') throw new Error(`status ${interaction.status}`)
                    return {text: String(interaction.output_text ?? ''), model}
                } catch (error) {
                    lastError = error
                    const message = error instanceof Error ? error.message : String(error)
                    // Фильтр безопасности отклонил досье — другие модели и повторы не помогут.
                    if (/input blocked|prohibited use/i.test(message)) throw error
                    if (message.includes('429') && isDailyLimit(message)) exhausted.add(model)
                    console.warn('[BUNDLES] Judge model failed', {model, round, message: message.slice(0, 160)})
                } finally {
                    if (id) await ai.interactions.delete(id).catch(() => undefined)
                }
            }
            if (exhausted.size === models.length) break
        }
        throw lastError ?? new Error('[BUNDLES] No judge model answered')
    }
}

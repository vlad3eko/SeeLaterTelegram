import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
    generateWithFallback,
    retryHintMs,
    TRANSLATE_RETRY_DELAYS_MS,
    translateModels,
    whisperTimingLanguage,
} from '../../engine/instagram/reel/subtitle/transcription/translate-foreign'
import {translationFailureReason} from '../../engine/instagram/reel/subtitle/transcription/whisper'

const quota = new Error('{"error":{"code":429,"message":"You exceeded your current quota","details":[{"retryDelay":"37s"}]}}')
const overloaded = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}')

test('перевод: пауза из ответа 429 берётся, но не больше минуты', () => {
    assert.equal(retryHintMs(quota), 37_000)
    assert.equal(retryHintMs(new Error('Please retry in 12.5s.')), 12_500)
    assert.equal(retryHintMs(new Error('"retryDelay": "600s"')), 60_000)
    assert.equal(retryHintMs(overloaded), undefined)
})

test('перевод: запасные модели — несколько, с отдельной квотой', () => {
    const models = translateModels({} as NodeJS.ProcessEnv)
    assert.equal(models[0], 'gemini-3.8-flash')
    assert.ok(models.length >= 4, models.join(','))
    assert.equal(new Set(models).size, models.length)
})

test('перевод: ждёт круги 5–60 с (с паузой из 429) и выживает перегрузку в несколько минут', async () => {
    const waits: number[] = []
    let calls = 0
    const value = await generateWithFallback(['a', 'b'], async model => {
        calls += 1
        // Первые три круга всё падает: a — квота, b — перегрузка; на четвёртом b отвечает.
        if (calls <= 6) throw model === 'a' ? quota : overloaded
        return model
    }, {delaysMs: TRANSLATE_RETRY_DELAYS_MS, followRetryHints: true, wait: async ms => { waits.push(ms) }})

    assert.equal(value, 'a')
    assert.deepEqual(waits, [37_000, 37_000, 37_000])
})

test('перевод: после всех кругов — последняя ошибка, без пауз сверх списка', async () => {
    const waits: number[] = []
    await assert.rejects(
        generateWithFallback(['a'], async () => { throw overloaded }, {
            delaysMs: TRANSLATE_RETRY_DELAYS_MS, followRetryHints: true, wait: async ms => { waits.push(ms) },
        }),
        /high demand/,
    )
    assert.deepEqual(waits, TRANSLATE_RETRY_DELAYS_MS)
})

test('перевод: причина для администратора по-русски', () => {
    assert.match(translationFailureReason(quota.message), /429/)
    assert.match(translationFailureReason(overloaded.message), /503/)
    assert.match(translationFailureReason('Subtitle time budget exceeded'), /времени/)
})

test('время слов: Whisper слушает язык речи, а не язык субтитров', () => {
    const w = (text: string, language?: string) => ({text, start: 0, end: 0.3, ...(language ? {language} : {})})
    assert.equal(whisperTimingLanguage([w('Hello', 'en-US'), w('there', 'en-US'), w('да', 'ru')], 'ru'), 'en')
    assert.equal(whisperTimingLanguage([w('Hello'), w('there'), w('friend')], 'ru'), 'auto')
    assert.equal(whisperTimingLanguage([w('Привет'), w('друг')], 'ru'), 'ru')
})

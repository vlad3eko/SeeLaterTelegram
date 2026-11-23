import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
    generateWithFallback,
    retryHintMs,
    TRANSLATE_RETRY_DELAYS_MS,
    translateModels,
    whisperTimingLanguage,
} from '../../engine/instagram/reel/subtitle/transcription/translate-foreign'
import {assignPhraseFlow, planPhraseExits} from '../../engine/instagram/reel/subtitle/render/phrase-flow'
import {resolveSubtitleConfig} from '../../engine/instagram/reel/subtitle/config'
import {parseShotCuts} from '../../engine/instagram/reel/subtitle/utils/shot-cuts'
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

const anim = resolveSubtitleConfig({}).animation
const word = (text: string, start: number, end: number) => ({text, start, end, displayStart: start - 0.05}) as never

test('тайминги: слово появляется со звуком — опережение не больше 60 мс', () => {
    const block = [[[word('ТЫ', 9.7, 9.9), word('ЕЩЁ', 9.9, 10.1), word('МОЖЕШЬ', 10.1, 10.5), word('ВЫБРАТЬ', 10.5, 11.0)]]]
    const summary = assignPhraseFlow(block as never, resolveSubtitleConfig({}))
    assert.ok(summary.meanLeadMs <= 60, String(summary.meanLeadMs))
    for (const w of block.flat(2) as Array<{start: number, displayStart: number}>) assert.ok(w.start - w.displayStart <= 0.061)
})

test('тайминги: без следующей фразы уходит через 0,1 с после речи', () => {
    const [exit] = planPhraseExits([[word('ЗЛА', 5.6, 6.0)]], [], anim)
    assert.equal(Math.round(exit!), 6100)
})

test('тайминги: следующая фраза через ≤ 1 с — держится до неё и сменяется наплывом', () => {
    const exits = planPhraseExits([[word('ПАРДОН', 39.0, 39.7)], [word('ВЕЖЛИВОСТЬ', 40.55, 41.0)]], [], anim)
    assert.equal(Math.round(exits[0]!), 40400)
})

test('тайминги: пауза больше 1 с — не висит до следующей', () => {
    const exits = planPhraseExits([[word('СЛУЖИТЬ', 11.7, 12.2)], [word('МОЙ', 16.0, 16.3)]], [], anim)
    assert.equal(Math.round(exits[0]!), 12300)
})

test('тайминги: склейка после речи — фраза уходит вместе с планом, но не раньше конца слова', () => {
    const [exit] = planPhraseExits([[word('СОБОЙ', 7.2, 7.6)], [word('КРЫШКИ', 8.5, 9.0)]], [7.9], anim)
    assert.ok(exit! >= 7600 && exit! <= 7900, String(exit))
    // Склейка посреди слова — не причина убрать его раньше.
    const [early] = planPhraseExits([[word('СОБОЙ', 7.2, 7.6)]], [7.5], anim)
    assert.equal(Math.round(early!), 7700)
})

test('тайминги: растянутое слово (музыка) не держит субтитр дольше 1,2 с', () => {
    const [exit] = planPhraseExits([[word('ЛЮБОВЬ', 31.0, 34.5)]], [], anim)
    assert.ok(exit! <= 32301, String(exit))
})

test('склейки: метки scdet разбираются и сливаются', () => {
    assert.deepEqual(parseShotCuts('x lavfi.scd.time=2.5\nlavfi.scd.time=2.54\nlavfi.scd.time=7.9\n'), [2.54, 7.9])
})

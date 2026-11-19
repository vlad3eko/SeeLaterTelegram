import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createReelProgress, humanReelError, initialReelProgress, reelFlowOf} from '../../engine/instagram/reel/jobs/reelProgress'

const run = (flow: Parameters<typeof createReelProgress>[0]['flow'], skip: any[] = []) => {
    let clock = 0
    const sent: string[] = []
    const progress = createReelProgress({title: '«Мангуст»', flow, skip, send: async text => { sent.push(text) }, now: () => clock})
    return {progress, sent, tick: (ms: number) => { clock += ms }}
}

test('этапы нарезки: шаги воркера отмечают этапы со временем и источником', async () => {
    const {progress, sent, tick} = run('fragments')
    progress.onStep('CHECK_SOURCE_IN_R2', 'start'); progress.onStep('CHECK_SOURCE_IN_R2', 'done')
    progress.onStep('DOWNLOAD_TRAILER', 'start'); tick(112_000); progress.onStep('DOWNLOAD_TRAILER', 'done')
    progress.onStep('BUILD_SOURCE_INDEX', 'start'); progress.onStep('TRANSCRIBE_SOURCE', 'start')
    tick(35_000); progress.onStep('BUILD_SOURCE_INDEX', 'done')
    await progress.flush()
    assert.equal(sent.at(-1), [
        '🎬 «Мангуст» — поиск фрагментов',
        '✅ Воркер запущен',
        '✅ Исходник получен · с YouTube · 1:52',
        '✅ Видео разобрано на планы и паузы · 0:35',
        '⏳ Расшифровываю речь…',
        '▫️ Gemini выбирает лучшие фрагменты',
        '▫️ Готовлю превью фрагментов'
    ].join('\n'))
})

test('ошибка: идущий этап с понятной причиной; пропущенные этапы скрыты', async () => {
    const {progress, sent} = run('finish', ['hooks'])
    progress.onStep('DOWNLOAD_CLEAN_VIDEO_FROM_R2', 'start')
    progress.onStep('GENERATE_INSTAGRAM_SUBTITLES', 'start')
    progress.failCurrent(new Error('ERROR: [youtube] x: Sign in to confirm you’re not a bot.'))
    await progress.flush()
    assert.match(sent.at(-1)!, /❌ Субтитры: распознаю речь и перевожу: YouTube требует вход/)
    assert.doesNotMatch(sent.at(-1)!, /пишет хук/)
})

test('этап вне плана дописывается, план по фазе', async () => {
    const {progress, sent} = run('fragments')
    progress.onStep('GEMINI_SELECT_FRAGMENTS', 'start')
    progress.onStep('GEMINI_SELECT_FRAGMENTS', 'error', new Error('[GEMINI] No fragments'))
    progress.onStep('PREPARE_INSTAGRAM_VIDEO', 'start')
    await progress.flush()
    assert.match(sent.at(-1)!, /❌ Gemini выбирает лучшие фрагменты: No fragments\n▫️ Готовлю превью фрагментов\n⏳ Монтирую clean/)
    assert.deepEqual(reelFlowOf({phase: 'clean', clip: true, fragmentChosen: false}), {flow: 'fragments', skip: []})
    assert.deepEqual(reelFlowOf({phase: 'finish', clip: true, fragmentChosen: true, hookChosen: true}), {flow: 'finish', skip: ['hooks']})
    assert.match(initialReelProgress('«X»', 'hooks'), /^🎬 «X» — варианты хука\n⏳ Запускаю воркер…\n▫️ Gemini смотрит фрагмент и пишет хук$/)
    assert.equal(humanReelError('Error: [WORKER DEADLINE] The job did not finish'), 'воркер не уложился во время и остановлен')
})

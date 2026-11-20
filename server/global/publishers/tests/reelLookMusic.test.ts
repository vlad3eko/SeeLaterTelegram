import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildLookFilters} from '../../engine/instagram/reel/utils/reelLook'
import {buildMusicMix, mergeSpeechWindows, musicSettings, speechVolumeExpression} from '../../engine/instagram/reel/utils/reelMusic'
import {getX264Args} from '../../engine/instagram/reel/utils/encodeSettings'

const frame = {input: '0:v', output: 'looked', width: 1080, height: 864, frameRate: '30'}

test('вид: зерно в 2/3 кадра растягивается до кадра, только быстрые фильтры; off и зерно 0', () => {
    const parts = buildLookFilters(frame, {} as NodeJS.ProcessEnv)
    assert.equal(parts.length, 3)
    assert.match(parts[0]!, /^\[0:v\]hqdn3d.*vignette=angle=PI\/10\[lookedBase\]$/)
    assert.match(parts[1]!, /s=720x576:r=30,.*noise=c0s=7:c0f=t,scale=1080:864/)
    assert.match(parts[2]!, /blend=c0_mode=overlay.*\[looked\]$/)
    // Медленные в однопоточном рендере: в цепочке их быть не должно.
    for (const slow of ['cas=', 'colorbalance', 'c0_expr']) assert.ok(!parts.join(';').includes(slow), slow)

    assert.deepEqual(buildLookFilters(frame, {REEL_LOOK: 'off'} as NodeJS.ProcessEnv), [])
    assert.equal(buildLookFilters(frame, {REEL_LOOK_GRAIN: '0'} as NodeJS.ProcessEnv).length, 1)
    assert.match(buildLookFilters(frame, {REEL_LOOK_GRAIN: '15'} as NodeJS.ProcessEnv)[1]!, /c0s=15:/)
    assert.match(buildLookFilters(frame, {REEL_LOOK_GRAIN: 'много'} as NodeJS.ProcessEnv)[1]!, /c0s=7:/)
})

test('музыка: окна речи с запасом, промежутки короче 1,5 с — ещё речь', () => {
    assert.deepEqual(
        mergeSpeechWindows([{start: 3.3, end: 6.35}, {start: 0, end: 2.65}, {start: 5.7, end: 8.35}, {start: 20, end: 21}, {start: 22.4, end: 23}, {start: 39, end: 41}], 40),
        [{start: 0, end: 8.6}, {start: 19.9, end: 23.25}, {start: 38.9, end: 40}]
    )
    // Промежуток 1,65 с (9,25→10,9) — уже пауза.
    assert.equal(mergeSpeechWindows([{start: 8, end: 9}, {start: 11, end: 12}], 40).length, 2)
    assert.deepEqual(mergeSpeechWindows([{start: 5, end: 4}, {start: Number.NaN, end: 1}], 10), [])
})

test('музыка: 25% под речью, 50% в паузах; трейлер: 100% под речью, 40% в паузах; переходы 0,4 с', () => {
    const windows = [{start: 0, end: 2.9}, {start: 10, end: 12}]
    const clip = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
    const evaluate = (expression: string) => (t: number) =>
        Number((Function('t', 'clip', 'min', `return ${expression}`)(t, clip, Math.min) as number).toFixed(3))

    const music = speechVolumeExpression(windows, {speech: 0.25, pause: 0.5})
    assert.equal(music,
        '0.5+(-0.25)*min(1,clip((t-(-0.4))/0.4,0,1)*clip((3.3-t)/0.4,0,1)+clip((t-(9.6))/0.4,0,1)*clip((12.4-t)/0.4,0,1))')
    const musicAt = evaluate(music)
    assert.deepEqual([musicAt(1), musicAt(6), musicAt(9.8), musicAt(11)], [0.25, 0.5, 0.375, 0.25])

    const trailerAt = evaluate(speechVolumeExpression(windows, {speech: 1, pause: 0.4}))
    assert.deepEqual([trailerAt(1), trailerAt(6), trailerAt(9.8), trailerAt(11)], [1, 0.4, 0.7, 1])

    assert.equal(speechVolumeExpression([], {speech: 0.25, pause: 0.5}), '0.25')
})

test('музыка: громкость трека подгоняется к трейлеру, трейлер тише только в паузах; без речи и без звука', () => {
    const base = {musicInput: 2, duration: 40, voiceLufs: -20, musicLufs: -14, speech: 0.25, pause: 0.5, trailerPause: 0.4}

    const withSpeech = buildMusicMix({...base, speechWindows: [{start: 5, end: 9}]})
    assert.match(withSpeech.filters[0]!, /^\[2:a\]atrim=0:40,.*volume=0\.501,volume='0\.5\+\(-0\.25\)\*min.*afade=t=out:st=38:d=2\[music\]$/)
    assert.match(withSpeech.filters[1]!, /^\[0:a\]aformat=.*,volume='0\.4\+\(0\.6\)\*min\(1,clip.*':eval=frame\[voice\]$/)
    assert.equal(withSpeech.filters[2], '[voice][music]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]')
    assert.equal(withSpeech.settings.matchGainDb, -6)
    assert.equal(withSpeech.settings.trailerPause, 0.4)

    // Whisper не дал речи: трейлер не трогаем, музыка весь ролик на 25%.
    const noSpeech = buildMusicMix({...base, speechWindows: []})
    assert.equal(noSpeech.filters[1], '[0:a]aformat=sample_rates=48000:channel_layouts=stereo[voice]')
    assert.match(noSpeech.filters[0]!, /volume='0\.25':eval=frame/)
    assert.equal(noSpeech.settings.trailerPause, 1)

    const silent = buildMusicMix({...base, speechWindows: [], voiceLufs: undefined})
    assert.equal(silent.filters.length, 2)
    assert.equal(silent.filters[1], '[music]loudnorm=I=-14:TP=-1.5:LRA=11[aout]')
})

test('музыка: настройки из окружения', () => {
    assert.deepEqual(
        {...musicSettings({} as NodeJS.ProcessEnv), path: ''},
        {enabled: true, path: '', speech: 0.25, pause: 0.5, trailerPause: 0.4}
    )
    const custom = musicSettings({REEL_MUSIC: 'off', REEL_MUSIC_SPEECH_VOLUME: '0.12', REEL_MUSIC_PAUSE_VOLUME: '2', REEL_TRAILER_PAUSE_VOLUME: '1'} as NodeJS.ProcessEnv)
    assert.equal(custom.enabled, false)
    assert.equal(custom.speech, 0.12)
    assert.equal(custom.pause, 0.5)
    assert.equal(custom.trailerPause, 1)
})

test('кодирование финала: с эффектами потолок 5 Мбит/с (ролик до ~80 с влезает в лимит Telegram 50 МБ)', () => {
    const rate = (args: string[]) => args[args.indexOf('-maxrate') + 1]
    assert.equal(rate(getX264Args('final')), '25000k')
    assert.equal(rate(getX264Args('final', {grain: true})), '5000k')
})

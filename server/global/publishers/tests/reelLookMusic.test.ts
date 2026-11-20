import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildLookFilters} from '../../engine/instagram/reel/utils/reelLook'
import {buildMusicMix, mergeSpeechWindows, musicSettings, musicVolumeExpression} from '../../engine/instagram/reel/utils/reelMusic'
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

test('музыка: окна речи с запасом, близкие фразы сливаются', () => {
    assert.deepEqual(
        mergeSpeechWindows([{start: 3.3, end: 6.35}, {start: 0, end: 2.65}, {start: 5.7, end: 8.35}, {start: 20, end: 21}, {start: 39, end: 41}], 40),
        // 2,9→3,2: пауза короче двух переходов — окна слиты, музыка между фразами не прыгает.
        [{start: 0, end: 8.6}, {start: 19.9, end: 21.25}, {start: 38.9, end: 40}]
    )
    assert.deepEqual(mergeSpeechWindows([{start: 5, end: 4}, {start: Number.NaN, end: 1}], 10), [])
})

test('музыка: 12% под речью, 25% в паузах, плавный переход; без речи — 12% весь ролик', () => {
    assert.equal(musicVolumeExpression([], {speech: 0.12, pause: 0.25}), '0.12')
    const expression = musicVolumeExpression([{start: 0, end: 2.9}, {start: 10, end: 12}], {speech: 0.12, pause: 0.25})
    assert.equal(expression,
        '0.25-0.13*min(1,clip((t-(-0.3))/0.3,0,1)*clip((3.2-t)/0.3,0,1)+clip((t-(9.7))/0.3,0,1)*clip((12.3-t)/0.3,0,1))')
    // Проверка смысла: подставляем t и считаем так же, как ffmpeg.
    const clip = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
    const at = (t: number) => Function('t', 'clip', 'min', `return ${expression}`)(t, clip, Math.min) as number
    assert.equal(Number(at(1).toFixed(3)), 0.12)
    assert.equal(Number(at(6).toFixed(3)), 0.25)
    assert.equal(Number(at(9.85).toFixed(3)), 0.185)
})

test('музыка: громкость трека подгоняется к звуку трейлера, длина — по ролику; без звука — одна музыка', () => {
    const mix = buildMusicMix({musicInput: 2, duration: 40, speechWindows: [], voiceLufs: -20, musicLufs: -14, speech: 0.12, pause: 0.25})
    assert.match(mix.filters[0]!, /^\[2:a\]atrim=0:40,.*volume=0\.501,volume='0\.12':eval=frame,afade=t=in:st=0:d=0\.8,afade=t=out:st=38:d=2\[music\]$/)
    assert.equal(mix.filters.at(-1), '[voice][music]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]')
    assert.equal(mix.settings.matchGainDb, -6)

    const silent = buildMusicMix({musicInput: 2, duration: 40, speechWindows: [], voiceLufs: undefined, musicLufs: -14, speech: 0.12, pause: 0.25})
    assert.equal(silent.filters.length, 2)
    assert.equal(silent.filters[1], '[music]loudnorm=I=-14:TP=-1.5:LRA=11[aout]')
})

test('музыка: настройки из окружения', () => {
    assert.deepEqual(
        {...musicSettings({} as NodeJS.ProcessEnv), path: ''},
        {enabled: true, path: '', speech: 0.12, pause: 0.25}
    )
    const custom = musicSettings({REEL_MUSIC: 'off', REEL_MUSIC_SPEECH_VOLUME: '0.06', REEL_MUSIC_PAUSE_VOLUME: '2'} as NodeJS.ProcessEnv)
    assert.equal(custom.enabled, false)
    assert.equal(custom.speech, 0.06)
    assert.equal(custom.pause, 0.25)
})

test('кодирование финала: с эффектами потолок 5 Мбит/с (ролик до ~80 с влезает в лимит Telegram 50 МБ)', () => {
    const rate = (args: string[]) => args[args.indexOf('-maxrate') + 1]
    assert.equal(rate(getX264Args('final')), '25000k')
    assert.equal(rate(getX264Args('final', {grain: true})), '5000k')
})

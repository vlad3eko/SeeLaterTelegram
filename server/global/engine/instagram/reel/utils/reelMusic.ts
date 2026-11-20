import {execFile} from 'node:child_process'
import {existsSync} from 'node:fs'
import path from 'node:path'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Фоновая музыка под ролик (решения владельца 20.11.2026). Громкость — в процентах от громкости
 * звука трейлера: 100% — музыка так же громкая, как трейлер. Уровни как в образце («На цепи»,
 * фон там примерно на 12 дБ тише речи):
 *   под речью — музыка 25%, звук трейлера 100%;
 *   в паузах — музыка 50%, звук трейлера 40%: своя музыка трейлера уходит на второй план,
 *   наша выходит вперёд.
 * Пауза — промежуток без речи от MIN_PAUSE_SECONDS; короче — считается речью (музыка не прыгает
 * между фразами). Окна речи — из Whisper (те же, что у субтитров), переходы плавные.
 * Без окон речи (Whisper не сработал) трейлер не трогается, музыка весь ролик на уровне «под речью».
 * Трек обрезается по длине ролика (короткий — повторяется), в начале и в конце плавное появление
 * и затухание.
 *
 * Настройки (переменные окружения, все необязательные):
 *   REEL_MUSIC                  off — без музыки (и без приглушения трейлера)
 *   REEL_MUSIC_PATH             путь к треку; по умолчанию public/instagram/music/background.mp3
 *   REEL_MUSIC_SPEECH_VOLUME    0–1, по умолчанию 0.25
 *   REEL_MUSIC_PAUSE_VOLUME     0–1, по умолчанию 0.5
 *   REEL_TRAILER_PAUSE_VOLUME   0–1, звук трейлера в паузах, по умолчанию 0.4 (1 — не приглушать)
 */

export type SpeechWindow = {start: number, end: number}

export const MUSIC_SPEECH_VOLUME = 0.25
export const MUSIC_PAUSE_VOLUME = 0.5
export const TRAILER_PAUSE_VOLUME = 0.4
/** Время перехода между уровнями, с. */
export const RAMP_SECONDS = 0.4
/** Промежуток без речи короче этого — не пауза. Не меньше двух переходов: переходы не накладываются. */
export const MIN_PAUSE_SECONDS = 1.5
/** Запас вокруг речи: уровни меняются чуть раньше первого слова и чуть позже последнего. */
const SPEECH_LEAD_SECONDS = 0.1
const SPEECH_TAIL_SECONDS = 0.25
const FADE_IN_SECONDS = 0.8
const FADE_OUT_SECONDS = 2

const isOff = (value: string | undefined) =>
    ['off', '0', 'false', 'no'].includes((value ?? '').trim().toLowerCase())

const readVolume = (raw: string | undefined, fallback: number) => {
    const value = raw?.trim() ? Number(raw) : Number.NaN
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
}

const fmt = (value: number) => String(Number(value.toFixed(3)))

export const musicSettings = (env: NodeJS.ProcessEnv = process.env) => ({
    enabled: !isOff(env.REEL_MUSIC),
    path: env.REEL_MUSIC_PATH?.trim() || path.join(process.cwd(), 'public', 'instagram', 'music', 'background.mp3'),
    speech: readVolume(env.REEL_MUSIC_SPEECH_VOLUME, MUSIC_SPEECH_VOLUME),
    pause: readVolume(env.REEL_MUSIC_PAUSE_VOLUME, MUSIC_PAUSE_VOLUME),
    trailerPause: readVolume(env.REEL_TRAILER_PAUSE_VOLUME, TRAILER_PAUSE_VOLUME)
})

/** Окна речи с запасом; промежутки короче MIN_PAUSE_SECONDS сливаются (это ещё речь). */
export const mergeSpeechWindows = (windows: SpeechWindow[], duration: number): SpeechWindow[] => {
    const padded = windows
        .filter(window => Number.isFinite(window.start) && Number.isFinite(window.end) && window.end > window.start)
        .map(window => ({
            start: Math.max(0, window.start - SPEECH_LEAD_SECONDS),
            end: Math.min(duration, window.end + SPEECH_TAIL_SECONDS)
        }))
        .filter(window => window.end > window.start)
        .sort((a, b) => a.start - b.start)

    const merged: SpeechWindow[] = []
    for (const window of padded) {
        const last = merged.at(-1)
        if (last && window.start - last.end < MIN_PAUSE_SECONDS) last.end = Math.max(last.end, window.end)
        else merged.push({...window})
    }
    return merged
}

/**
 * Выражение громкости для фильтра volume (eval=frame): `speech` в окнах речи, `pause` в паузах,
 * линейные переходы по RAMP_SECONDS перед окном и после него. Подходит и для музыки
 * (в паузах громче), и для трейлера (в паузах тише).
 */
export const speechVolumeExpression = (
    windows: SpeechWindow[],
    {speech, pause}: {speech: number, pause: number}
): string => {
    if (!windows.length) return fmt(speech)
    const r = fmt(RAMP_SECONDS)
    const inSpeech = windows.map(({start, end}) =>
        `clip((t-(${fmt(start - RAMP_SECONDS)}))/${r},0,1)*clip((${fmt(end + RAMP_SECONDS)}-t)/${r},0,1)`)
    return `${fmt(pause)}+(${fmt(speech - pause)})*min(1,${inSpeech.join('+')})`
}

const loudnessCache = new Map<string, Promise<number | undefined>>()

/** Интегральная громкость (LUFS) первой звуковой дорожки; нет звука или ошибка — undefined. */
export const measureLoudness = (ffmpegBinary: string, file: string, {cache = false} = {}): Promise<number | undefined> => {
    const cached = cache ? loudnessCache.get(file) : undefined
    if (cached) return cached

    const work = execFileAsync(
        ffmpegBinary,
        ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'],
        {timeout: 60_000, maxBuffer: 10 * 1024 * 1024}
    )
        .then(({stderr}) => {
            const matches = [...String(stderr).matchAll(/I:\s+(-?\d+(?:\.\d+)?) LUFS/g)]
            const value = Number(matches.at(-1)?.[1])
            // -70 и ниже — тишина: подогнать музыку к ней нельзя.
            return Number.isFinite(value) && value > -70 ? value : undefined
        })
        .catch(() => undefined)

    if (cache) loudnessCache.set(file, work)
    return work
}

export type MusicMix = {
    /** Части filter_complex; звук ролика выходит из метки [aout]. */
    filters: string[]
    settings: Record<string, number | string | boolean>
}

/**
 * Звук ролика с фоновой музыкой. Музыка — вход с индексом musicInput (подключён с -stream_loop -1).
 * voiceLufs — громкость звука трейлера; undefined — звука нет, в ролике одна музыка.
 */
export const buildMusicMix = (
    {musicInput, duration, speechWindows, voiceLufs, musicLufs, speech, pause, trailerPause}: {
        musicInput: number
        duration: number
        speechWindows: SpeechWindow[]
        voiceLufs: number | undefined
        musicLufs: number
        speech: number
        pause: number
        trailerPause: number
    }
): MusicMix => {
    const windows = mergeSpeechWindows(speechWindows, duration)
    // 100% — музыка так же громкая, как звук трейлера.
    const matchGain = voiceLufs === undefined ? 1 : 10 ** ((voiceLufs - musicLufs) / 20)
    const fadeOutStart = Math.max(0, duration - FADE_OUT_SECONDS)

    const music =
        `[${musicInput}:a]atrim=0:${fmt(duration)},asetpts=PTS-STARTPTS,` +
        'aformat=sample_rates=48000:channel_layouts=stereo,' +
        `volume=${fmt(matchGain)},` +
        `volume='${speechVolumeExpression(windows, {speech, pause})}':eval=frame,` +
        `afade=t=in:st=0:d=${fmt(Math.min(FADE_IN_SECONDS, duration / 4))},` +
        `afade=t=out:st=${fmt(fadeOutStart)}:d=${fmt(Math.min(FADE_OUT_SECONDS, duration))}[music]`

    // Трейлер в паузах тише; без окон речи (или trailerPause=1) не трогается.
    const trailerDucked = windows.length > 0 && trailerPause < 1
    const voice =
        '[0:a]aformat=sample_rates=48000:channel_layouts=stereo' +
        (trailerDucked ? `,volume='${speechVolumeExpression(windows, {speech: 1, pause: trailerPause})}':eval=frame` : '') +
        '[voice]'

    const filters = voiceLufs === undefined
        ? [music, '[music]loudnorm=I=-14:TP=-1.5:LRA=11[aout]']
        : [
            music,
            voice,
            '[voice][music]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]'
        ]

    return {
        filters,
        settings: {
            speech,
            pause,
            trailerPause: trailerDucked ? trailerPause : 1,
            speechWindows: windows.length,
            voiceLufs: voiceLufs ?? 'нет звука',
            musicLufs,
            matchGainDb: Number((20 * Math.log10(matchGain)).toFixed(1))
        }
    }
}

export const musicTrackExists = (file: string) => existsSync(file)

import {execFile} from 'node:child_process'
import {existsSync} from 'node:fs'
import path from 'node:path'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Фоновая музыка под ролик (решение владельца 20.11.2026). Громкость задаётся в процентах от
 * громкости звука трейлера: 100% — музыка так же громкая, как речь. По просьбе владельца уровни
 * вдвое ниже, чем в образце («На цепи», фон там примерно на 12 дБ тише речи):
 *   под речью — 12%, в паузах — 25%.
 * Окна речи — из Whisper (те же, что у субтитров); переход между уровнями плавный, 0,3 с.
 * Без окон речи музыка весь ролик идёт на уровне «под речью» — так она точно не мешает.
 * Трек обрезается по длине ролика (короткий — повторяется), в начале и в конце плавное появление
 * и затухание.
 *
 * Настройки (переменные окружения, все необязательные):
 *   REEL_MUSIC                off — без музыки
 *   REEL_MUSIC_PATH           путь к треку; по умолчанию public/instagram/music/background.mp3
 *   REEL_MUSIC_SPEECH_VOLUME  0–1, по умолчанию 0.12
 *   REEL_MUSIC_PAUSE_VOLUME   0–1, по умолчанию 0.25
 */

export type SpeechWindow = {start: number, end: number}

export const MUSIC_SPEECH_VOLUME = 0.12
export const MUSIC_PAUSE_VOLUME = 0.25
/** Время перехода между уровнями, с. */
export const MUSIC_RAMP_SECONDS = 0.3
/** Запас вокруг речи: музыка опускается чуть раньше первого слова и поднимается чуть позже последнего. */
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
    pause: readVolume(env.REEL_MUSIC_PAUSE_VOLUME, MUSIC_PAUSE_VOLUME)
})

/**
 * Окна речи с запасом, слитые так, чтобы переходы соседних окон не накладывались
 * (пауза короче двух переходов — музыка между фразами не поднимается).
 */
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
        if (last && window.start - last.end < MUSIC_RAMP_SECONDS * 2) last.end = Math.max(last.end, window.end)
        else merged.push({...window})
    }
    return merged
}

/**
 * Выражение громкости для фильтра volume (eval=frame): `pause` в паузах, `speech` в окнах речи,
 * линейные переходы по MUSIC_RAMP_SECONDS перед окном и после него.
 */
export const musicVolumeExpression = (
    windows: SpeechWindow[],
    {speech, pause}: {speech: number, pause: number}
): string => {
    if (!windows.length) return fmt(speech)
    const r = fmt(MUSIC_RAMP_SECONDS)
    const ducks = windows.map(({start, end}) =>
        `clip((t-(${fmt(start - MUSIC_RAMP_SECONDS)}))/${r},0,1)*clip((${fmt(end + MUSIC_RAMP_SECONDS)}-t)/${r},0,1)`)
    return `${fmt(pause)}-${fmt(pause - speech)}*min(1,${ducks.join('+')})`
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
    {musicInput, duration, speechWindows, voiceLufs, musicLufs, speech, pause}: {
        musicInput: number
        duration: number
        speechWindows: SpeechWindow[]
        voiceLufs: number | undefined
        musicLufs: number
        speech: number
        pause: number
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
        `volume='${musicVolumeExpression(windows, {speech, pause})}':eval=frame,` +
        `afade=t=in:st=0:d=${fmt(Math.min(FADE_IN_SECONDS, duration / 4))},` +
        `afade=t=out:st=${fmt(fadeOutStart)}:d=${fmt(Math.min(FADE_OUT_SECONDS, duration))}[music]`

    const filters = voiceLufs === undefined
        ? [music, '[music]loudnorm=I=-14:TP=-1.5:LRA=11[aout]']
        : [
            music,
            '[0:a]aformat=sample_rates=48000:channel_layouts=stereo[voice]',
            '[voice][music]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]'
        ]

    return {
        filters,
        settings: {
            speech,
            pause,
            speechWindows: windows.length,
            voiceLufs: voiceLufs ?? 'нет звука',
            musicLufs,
            matchGainDb: Number((20 * Math.log10(matchGain)).toFixed(1))
        }
    }
}

export const musicTrackExists = (file: string) => existsSync(file)

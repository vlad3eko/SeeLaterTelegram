/**
 * Настройки кодирования H.264 для двух этапов Reel.
 *
 *   clean  — промежуточный квадрат 1080×1080 (prepareInstagramVideo.ts);
 *   final  — готовый ролик с оформлением (decorateInstagramVideo.ts).
 *
 * Картинка проходит три сжатия: clean, финальный ролик и пережатие самим Instagram.
 * Раньше оба первых этапа шли с preset ultrafast: libx264 в этом режиме отключает B-кадры
 * и CABAC, поэтому ffprobe показывал «Constrained Baseline», а при том же качестве файл
 * был примерно на четверть больше. Замер на 40-секундном квадрате: veryfast CRF 17 даёт
 * тот же SSIM, что ultrafast CRF 20, при размере 19,7 МБ вместо 25,8 МБ.
 *
 * Настройки можно менять без правки кода (переменные окружения, все необязательные):
 *   REEL_X264_PRESET           ultrafast … slow, по умолчанию veryfast
 *   REEL_CLEAN_CRF             10–28, по умолчанию 16
 *   REEL_FINAL_CRF             10–28, по умолчанию 17
 *   REEL_X264_THREADS          1–8, по умолчанию 2
 *   REEL_FINAL_MAXRATE_KBPS    потолок битрейта финала, по умолчанию 25000 (25 Мбит/с)
 */

export type EncodeStage = 'clean' | 'final'

const PRESETS = new Set([
    'ultrafast',
    'superfast',
    'veryfast',
    'faster',
    'fast',
    'medium',
    'slow'
])

const readNumber = (name: string, fallback: number, min: number, max: number) => {
    const raw = process.env[name]
    const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

/**
 * Аргументы ffmpeg для видеокодера libx264 (без -pix_fmt: его каждый этап задаёт сам).
 */
export const getX264Args = (stage: EncodeStage): string[] => {
    const rawPreset = process.env.REEL_X264_PRESET?.trim().toLowerCase()
    const preset = rawPreset && PRESETS.has(rawPreset) ? rawPreset : 'veryfast'

    const crf = stage === 'clean'
        ? readNumber('REEL_CLEAN_CRF', 16, 10, 28)
        : readNumber('REEL_FINAL_CRF', 17, 10, 28)

    const args = [
        '-c:v', 'libx264',
        '-preset', preset,
        '-crf', String(crf),
        '-threads', String(readNumber('REEL_X264_THREADS', 2, 1, 8)),
        '-profile:v', 'high'
    ]

    if (stage === 'final') {
        // Потолок на редкие всплески битрейта в очень детальных кадрах.
        const maxrate = readNumber('REEL_FINAL_MAXRATE_KBPS', 25_000, 3_000, 100_000)
        args.push('-maxrate', `${maxrate}k`, '-bufsize', `${maxrate * 2}k`)
    }

    return args
}

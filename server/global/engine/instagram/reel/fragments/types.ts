/**
 * Фрагмент нарезки для Reels (выбор фрагментов, запрос владельца 12.11): Gemini находит
 * до 8 законченных кусков по 40–60 секунд (лучше около минуты), код подгоняет границы
 * к склейкам и паузам, администратор выбирает один из альбома превью.
 */
export type ClipFragment = {
    /** Начало и конец в секундах исходника. */
    start: number
    end: number
    /** Короткое название момента (до 6 слов). */
    title: string
    /** Почему этот фрагмент (одна фраза). */
    reason: string
    /** Превью 640×360 в R2 (ссылка с версией), для альбома в Telegram. */
    previewUrl?: string
}

/** Сколько фрагментов просим у Gemini и показываем всего. */
export const FRAGMENTS_MAX = 8
/** Сколько превью в одном альбоме (одна «страница»). */
export const FRAGMENTS_PER_PAGE = 4
/** Длина фрагмента: цель, минимум и максимум, секунды. */
export const FRAGMENT_TARGET_SECONDS = 60
export const FRAGMENT_MIN_SECONDS = 40
export const FRAGMENT_MAX_SECONDS = 60

export const formatClock = (seconds: number): string => {
    const total = Math.max(0, Math.round(seconds))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

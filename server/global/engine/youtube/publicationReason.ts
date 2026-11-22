import {isRussianAudio} from '#server/global/engine/youtube/config'

/**
 * Причина автопубликации — строка на месте комментария администратора (моноширинным) в посте
 * канала: что за ролик стал поводом и когда выходит тайтл (решение владельца 22.11).
 * «Новый тизер-трейлер второго сезона, который выйдет 18 февраля 2027».
 * Чистая функция: заголовок ролика YouTube и карточка TMDB, без запросов.
 */

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const ORDINALS = ['', 'первого', 'второго', 'третьего', 'четвёртого', 'пятого', 'шестого', 'седьмого', 'восьмого', 'девятого', 'десятого']

const KIND_GENITIVE: Record<string, string> = {
    movie: 'фильма',
    cartoon: 'мультфильма',
    series: 'сериала',
    cartoonSeries: 'мультсериала',
    anime: 'аниме'
}

/** «2027-02-18» → «18 февраля 2027». */
export const longDate = (date: string) => {
    const [year, month, day] = date.split('-').map(Number)
    return year && month && day ? `${day} ${MONTHS[month - 1]} ${year}` : ''
}

/** Что за ролик — по заголовку (русские и английские названия). */
export const videoKind = (title: string) => {
    const lower = title.toLowerCase()
    const kind =
        /тизер|teaser/.test(lower) ? 'тизер-трейлер'
            : /финальн\S* трейлер|final trailer/.test(lower) ? 'финальный трейлер'
                : /трейлер|trailer/.test(lower) ? 'трейлер'
                    : /отрыв|сцена|клип|\bclip\b|\bscene\b/.test(lower) ? 'отрывок'
                        : /featurette|behind the scenes|за кадром|о съёмках/.test(lower) ? 'ролик о съёмках'
                            : 'ролик'
    // Дубляж: «русский трейлер», «русский тизер-трейлер».
    return isRussianAudio(title) && kind !== 'ролик о съёмках' && kind !== 'ролик' ? `русский ${kind}` : kind
}

/** Номер сезона из заголовка: «Season 2», «2 сезон», «сезон 2», «S2». */
export const seasonFromTitle = (title: string): number | undefined => {
    const match = title.match(/season\s*(\d{1,2})|(\d{1,2})[\s-]*(?:й\s*)?сезон|сезон\s*(\d{1,2})|\bS(\d{1,2})\b/i)
    const value = Number(match?.[1] ?? match?.[2] ?? match?.[3] ?? match?.[4])
    return value > 0 ? value : undefined
}

const ordinal = (season: number) => ORDINALS[season] ?? `${season}-го`

export const publicationReason = ({videoTitle, media, mediaType, contentType, today}: {
    videoTitle: string
    media: Record<string, any>
    mediaType: 'movie' | 'tv'
    contentType: string
    /** «2026-11-22», по Москве. */
    today: string
}): string => {
    const kind = videoKind(videoTitle)
    const seasons: Array<{season_number?: number, air_date?: string | null}> =
        Array.isArray(media.seasons) ? media.seasons.filter((season: any) => Number(season?.season_number) > 0) : []

    let subject = KIND_GENITIVE[contentType] ?? (mediaType === 'tv' ? 'сериала' : 'фильма')
    let date: string | undefined = mediaType === 'movie' ? media.release_date : media.first_air_date

    if (mediaType === 'tv') {
        // Сезон из заголовка; без него — ближайший невышедший сезон, если он уже объявлен.
        const fromTitle = seasonFromTitle(videoTitle)
        const season = fromTitle !== undefined
            ? seasons.find(item => Number(item.season_number) === fromTitle) ?? {season_number: fromTitle, air_date: null}
            : seasons.find(item => item.air_date && item.air_date > today)
        if (season?.season_number && (fromTitle !== undefined || season.season_number > 1)) {
            subject = `${ordinal(season.season_number)} сезона`
            date = season.air_date ?? undefined
        }
    }

    const when = date && longDate(date)
    if (!when) return `Новый ${kind} ${subject}`
    return date! > today
        ? `Новый ${kind} ${subject}, который выйдет ${when}`
        : `Новый ${kind} ${subject}, который вышел ${when}`
}

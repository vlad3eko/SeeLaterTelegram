import {dateConvert} from "~/utils/convert/dateConvert"

/**
 * Какую дату показывать у сериала: first — первая серия (по умолчанию, как раньше);
 * last — последняя вышедшая серия («Вышли полностью»); episode — последняя серия с номером
 * («Новые серии»); season — старт последнего вышедшего сезона («Новые сезоны»).
 */
export type TvDate = 'first' | 'last' | 'episode' | 'season'

/** Подпись даты сериала для подборок: «последняя серия 2×05 · 14 ноября», «3 сезон с 12 ноября». */
const tvDateText = (media: any, tvDate: TvDate | undefined): string | null => {
    const today = new Date().toISOString().slice(0, 10)
    if (tvDate === 'season') {
        const season = (media.seasons ?? [])
            .filter((item: any) => Number(item.season_number) > 0 && item.air_date && item.air_date <= today)
            .at(-1)
        if (season) return `${season.season_number} сезон с ${dateConvert(season.air_date)}`
    }
    if (tvDate === 'episode') {
        const episode = media.last_episode_to_air
        if (episode?.air_date) {
            const number = `${episode.season_number}×${String(episode.episode_number).padStart(2, '0')}`
            return `последняя серия ${number} · ${dateConvert(episode.air_date)}`
        }
    }
    if (tvDate && tvDate !== 'first' && media.last_air_date) return `последняя серия ${dateConvert(media.last_air_date)}`
    return null
}

export type RichListCaptionOptions = {
    tvDate?: TvDate
    /** Номер первого элемента (подборки /g: на второй странице — 11). */
    startNumber?: number
}

export const createRichListCaption = (
    items: any[],
    options: RichListCaptionOptions = {}
) => {

    const start = options.startNumber ?? 1

    const messageBlocks = items.map((item: any, index: number) => {

                const media =
                    item.data.media

                const image =
                    item.query.stillFileId ??
                    item.data.images
                        ?.poster?.[0]

                const title =
                    media.title ||
                    media.name ||
                    media.original_title ||
                    media.original_name ||
                    'Без названия'

                const tvText =
                    item.query.type === 'tv' ? tvDateText(media, options.tvDate) : null

                const date =
                    media.release_date || media.first_air_date

                const formattedDate =
                    tvText ?? (date
                        ? dateConvert(date)
                        : '')

                const rating =
                    Number(
                        media.vote_average || 0
                    )

                const type =
                    item.query.type === 'tv'
                        ? 'сериал'
                        : item.query.type === 'movie'
                            ? 'фильм'
                            : 'персона'

                return {

                    value:
                        start + index,

                    blocks: [

                        {
                            type: 'heading',
                            size: 1,
                            // Номер отдельно от названия: по нажатию копируется только название.
                            text: [
                                `${start + index}. `,
                                {
                                    type: 'code',
                                    text: title
                                }
                            ]
                        },

                        {
                            type: 'details',
                            summary: 'подробнее/скрыть',

                            blocks: [

                                ...(image
                                        ? [
                                            {
                                                type: 'photo',

                                                photo: {
                                                    type: 'photo',
                                                    media: image
                                                },

                                                caption: {
                                                    text:
                                                        `Обложка ${type}а`
                                                }
                                            }
                                        ]
                                        : []
                                ),

                                {
                                    type: 'paragraph',

                                    text: [
                                        `#${type}`,

                                        formattedDate
                                            ? ` · ${formattedDate}`
                                            : '',

                                        ` · 💎 ${rating.toFixed(1)}`
                                    ]
                                },

                                ...(media.overview
                                        ? [
                                            {
                                                type: 'blockquote',

                                                blocks: [
                                                    {
                                                        type: 'pullquote',
                                                        text:
                                                        media.overview
                                                    }
                                                ]
                                            }
                                        ]
                                        : []
                                )
                            ]
                        }
                    ]
                }
            })

    const blocks: any[] = [

        {
            type: 'list',

            items:
            messageBlocks
        }
    ]

    return {
        blocks
    }
}

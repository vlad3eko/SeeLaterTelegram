import {dateConvert} from "~/utils/convert/dateConvert"

export type RichListCaptionOptions = {
    /**
     * Какую дату показывать у сериала: first — первая серия (по умолчанию, как раньше);
     * last — последняя вышедшая серия (подборки «Вышли полностью», «Новые серии/сезоны»).
     */
    tvDate?: 'first' | 'last'
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
                    item.data.images
                        ?.poster?.[0]

                const title =
                    media.title ||
                    media.name ||
                    media.original_title ||
                    media.original_name ||
                    'Без названия'

                const useLastEpisode =
                    options.tvDate === 'last' && item.query.type === 'tv' && media.last_air_date

                const date =
                    useLastEpisode
                        ? media.last_air_date
                        : media.release_date || media.first_air_date

                const formattedDate =
                    date
                        ? dateConvert(date)
                        : ''

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
                                            ? ` · ${useLastEpisode ? 'последняя серия ' : ''}${formattedDate}`
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

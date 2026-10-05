import {dateConvert} from "~/utils/convert/dateConvert"

export const createRichListCaption = (
    items: any[]
) => {

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

                const date =
                    media.release_date ||
                    media.first_air_date

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
                        index + 1,

                    blocks: [

                        {
                            type: 'heading',
                            size: 1,
                            text: [{
                                type: 'code',
                                text: `${index + 1}: ` + title
                            }]
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

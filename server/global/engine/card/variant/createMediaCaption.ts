import {telegramBotShortLink, telegramChannelShortLink} from "#server/global/oneLinkApp";
import {runtimeConvert} from "~/utils/convert/runtimeConvert";
import {dateConvert} from "~/utils/convert/dateConvert";
import {
    dataCollectionMediaCard
} from "#server/global/engine/card/collectionCard/dataCollectionMediaCard";
import {CardData, statusRichCard} from "#server/global/engine/card/enum/types";

export const createMediaCaption = (
    preview: statusRichCard,
    data: CardData
): { blocks: any[] } => {

    const dataCollection = dataCollectionMediaCard(data)

    const media = dataCollection.data.media
    const images = dataCollection.data.images

    let blocks: any[] = []

    switch (preview) {
        case "pending":
            blocks = [

                ...(images?.poster?.[0]
                        ? [
                            {
                                type: 'photo',
                                photo: {
                                    type: 'photo',
                                    media: images.poster[0]
                                }
                            }
                        ]
                        : []
                ),

                {
                    type: 'paragraph',
                    text: [
                        {
                            type: 'bold',
                            text: dataCollection.mediaType
                        },
                        {
                            type: 'bold',
                            text: `| 💎 ${dataCollection.rating || 0} | 🍿 ${media.vote_count || 0}`
                        },
                    ]
                },

                {
                    type: 'paragraph',
                    text: [
                        {
                            type: 'bold',
                            text: dataCollection.date + ' | '
                        },
                        {
                            type: 'bold',
                            text: dataCollection.genres
                        }
                    ]
                },

                dataCollection.heading(
                    `Загрузка карточки ${dataCollection.mediaType}а...`,
                    1
                )

            ]
            break
        case "ready":
            blocks = [

                ...(data.addComment
                        ? [
                            {
                                type: 'divider'
                            },
                            {
                                type: 'pullquote',
                                text: String(data.addComment)
                            }
                        ]
                        : media.tagline
                            ? [
                                {
                                    type: 'pullquote',
                                    text: media.tagline
                                }
                            ]
                            : []
                ),

                ...(data.mediaOverride
                        ? [
                            data.mediaOverride.type === 'video'
                                ? {
                                    type: 'video',
                                    video: {
                                        type: 'video',
                                        media: data.mediaOverride.fileId
                                    }
                                }
                                : {
                                    type: 'photo',
                                    photo: {
                                        type: 'photo',
                                        media: data.mediaOverride.fileId
                                    }
                                }
                        ]
                        : images?.poster?.[0]
                            ? [
                                {
                                    type: 'photo',
                                    photo: {
                                        type: 'photo',
                                        media: images.poster[0]
                                    }
                                }
                            ]
                            : []
                ),

                {
                    type: 'heading',
                    size: 1,
                    text: [{
                        type: 'code',
                        text: dataCollection.title
                    }]
                },

                ...(dataCollection.originalTitle
                        ? [
                            {
                                type: 'footer',
                                text: ` • original:«${dataCollection.originalTitle}»`
                            }
                        ]
                        : []
                ),

                {
                    type: 'divider',
                },

                dataCollection.heading(
                    'Описание',
                    3
                ),

                ...(images?.poster?.[1]
                        ? [
                            {
                                type: 'slideshow',
                                blocks: [
                                    {
                                        type: 'photo',
                                        photo: {
                                            type: 'photo',
                                            media: images.poster[1]
                                        }
                                    }
                                ],
                                caption: {
                                    text: `Обложка ${dataCollection.mediaType}а`
                                }
                            }
                        ]
                        : []
                ),

                {
                    type: 'blockquote',
                    blocks: [
                        {
                            type: 'pullquote',
                            text: dataCollection.overview
                        }
                    ]
                },

                {
                    type: 'divider',
                },

                dataCollection.heading(
                    'Актёры',
                    3
                ),

                {
                    type: 'details',
                    summary: 'показать/скрыть',
                    blocks: [
                        ...(dataCollection.slideshowImages.length
                                ? [
                                    {
                                        type: 'collage',
                                        blocks: dataCollection.slideshowImages.map(fileId => ({
                                            type: 'photo',
                                            photo: {
                                                type: 'photo',
                                                media: fileId
                                            }
                                        })),
                                        caption: {
                                            text: 'Первые лица'
                                        }
                                    },

                                    {
                                        type: 'table',
                                        is_bordered: true,
                                        is_compact: true,
                                        cells: [
                                            [
                                                {
                                                    text: 'Имя',
                                                    is_header: true
                                                },
                                                {
                                                    text: 'Роль',
                                                    is_header: true
                                                },
                                            ],

                                            ...images!.postersList
                                                .filter(item => item?.fileId)
                                                .map(item => [
                                                    {
                                                        text: item!.name
                                                    },
                                                    {
                                                        text: item!.role
                                                    },
                                                ])
                                        ],
                                    }
                                ]
                                : []
                        ),

                    ]
                },

                {
                    type: 'blockquote',
                    blocks: [
                        {
                            type: 'details',
                            summary: 'Дополнительная информация',
                            blocks: [

                                {
                                    type: 'paragraph',
                                    text: `💂🏼‍♀️ Страны: ${(media.production_countries || [])
                                        .map((country: any) => country.name)
                                        .join(' · ')}`
                                },

                                {
                                    type: 'paragraph',
                                    text: `💰 Бюджет: ${
                                        Number(media.budget).toLocaleString('en-US') + `$` || '-'
                                    }`
                                },

                                {
                                    type: 'paragraph',
                                    text: `💰 Сборы: ${
                                        Number(media.revenue).toLocaleString('en-US') + `$` || '-'
                                    }`
                                },

                                {
                                    type: 'paragraph',
                                    text: `💎 imdb: ${Number(dataCollection.rating)
                                    || '...'}`
                                },

                                {
                                    type: 'paragraph',
                                    text: `🍿 Голосов: ${Number(media.vote_count)
                                    || '...'}`
                                },

                                {
                                    type: 'paragraph',
                                    text: `⏳ Продолжительность: ${
                                        runtimeConvert(media.runtime)
                                        || '...'
                                    }`
                                },

                                {
                                    type: 'paragraph',
                                    text: `📅 Дата выхода: ${
                                        dateConvert(media.release_date
                                            || media.first_air_date)
                                        || '...'
                                    }`
                                },

                                {
                                    type: 'paragraph',
                                    text: `Жанр: ${dataCollection.genres}`
                                },

                                {
                                    type: 'paragraph',
                                    text: [
                                        {
                                            type: 'bold',
                                            text: `Тип: #${dataCollection.mediaType}`
                                        }
                                    ]
                                },

                                ...(dataCollection.hasTrailer
                                        ? [
                                            {
                                                type: 'divider'
                                            },
                                            {
                                                type: 'paragraph',
                                                text: [
                                                    {
                                                        type: 'url',
                                                        text: '🔥 Смотреть трейлер',
                                                        url: `https://www.youtube.com/watch?v=${dataCollection.data.keyTrailer}`
                                                    }
                                                ]
                                            }
                                        ]
                                        : [
                                            {
                                                type: 'paragraph',
                                                text: '🎥 Трейлера пока нет'
                                            }
                                        ]
                                ),

                            ]
                        }
                    ]
                },

                dataCollection.spaceRow,

                {
                    type: 'paragraph',
                    text: [
                        {
                            type: 'url',
                            text: [
                                {
                                    type: 'bold',
                                    text: '🤖 Киноманов BOT'
                                }
                            ],
                            url: String(telegramBotShortLink)
                        },
                        ' · ',
                        {
                            type: 'url',
                            text: [
                                {
                                    type: 'bold',
                                    text: '📢 Киноманов NET'
                                }
                            ],
                            url: String(telegramChannelShortLink)
                        },
                    ]
                },

                {
                    type: 'paragraph',
                    text: [
                        {
                            type: 'url',
                            text: [
                                {
                                    type: 'italic',
                                    text: '❔ Вопросы и предложения'
                                }
                            ],
                            url: 'https://t.me/kinomanovGroup/2/4'
                        }
                    ]
                },

                {
                    type: 'divider'
                },

            ]
            break
    }

    return {
        blocks
    }
}

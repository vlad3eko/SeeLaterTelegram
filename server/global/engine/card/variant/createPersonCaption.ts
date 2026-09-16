
import {personSocials} from "#server/global/helpers/person/socialMedia";
import {convertProfession} from "#server/global/helpers/person/convertProfession";
import {getPersonAge} from "#server/global/helpers/person/getPersonAge";
import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";
import {CardData, statusRichCard} from "#server/global/engine/card/enum/types";
import {dataCollectionPersonCard} from "#server/global/engine/card/collectionCard/dataCollectionPersonCard";

export const createPersonCaption = (
    preview: statusRichCard,
    data: CardData
): { blocks: any[] } => {

    const media = data.media
    const dataCollection = dataCollectionPersonCard(data)

    const name = {
        type: 'heading',
        size: 1,
        text: [
            {
                type: 'code',
                text: dataCollection.title
            }
        ]
    }

    const profession = {
        type: 'paragraph',
        text: convertProfession(media)
    }

    const personTmdbId = {
        type: 'paragraph',
        text: [
            'TMDB: ',
            {
                type: 'code',
                text: String(media.id)
            }
        ]
    }

    const personAge = media.birthday
        ? {
            type: 'paragraph',
            text: `Возраст: ${getPersonAge(media.birthday)}`
        }
        : null

    const placeOfBirth = media.place_of_birth
        ? {
            type: 'paragraph',
            text: `Место рождения: ${media.place_of_birth}`
        }
        : null

    const knownForBlock = data.images?.postersList?.length
        ? [
            {
                type: 'heading',
                size: 3,
                text: 'Список популярных работ:'
            },
            {
                type: 'slideshow',
                blocks: data.images.postersList
                    .filter((item: any) => item?.fileId)
                    .map((item: any) => ({
                        type: 'photo',
                        photo: {
                            type: 'photo',
                            media: item.fileId
                        }
                    })),
                caption: {
                    text: 'Обложки'
                }
            },
            {
                type: 'table',
                is_bordered: true,
                is_compact: true,
                cells: [
                    [
                        {
                            text: 'Картина',
                            is_header: true
                        },
                        {
                            text: 'Роль',
                            is_header: true
                        },
                        {
                            text: 'Релиз',
                            is_header: true
                        },
                    ],
                    ...data.images.postersList
                        .filter((item: any) => item?.fileId)
                        .map((item: any) => [
                            {
                                text: item.name
                            },
                            {
                                text: item.role
                            },
                            {
                                text: item.releaseDate
                            },
                        ])
                ],
            }
        ]
        : []

    const awardBlock = dataCollection.award.length
        ? [
            {
                type: 'heading',
                size: 3,
                text: 'Достижения:'
            },
            ...dataCollection.award.map((award: any) => ({
                type: 'blockquote',
                blocks: [award]
            }))
        ]
        : []

    const factBlock = dataCollection.fact.length
        ? dataCollection.fact
        : []

    const socialBlock = personSocials(media.external_ids)

    const spaceRow = [
        {
            type: 'paragraph',
            text: ''
        },
        {
            type: 'divider'
        },
    ]

    let blocks: any[] = []

    switch (preview) {
        case "pending":
            blocks = [
                ...(data.images?.poster?.[0]
                        ? [
                            {
                                type: 'photo',
                                photo: {
                                    type: 'photo',
                                    media: data.images.poster[0]
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
                            text: `${convertTranslateKnowForDepartment(dataCollection.profession)} | `
                        },
                    ]
                },

                {
                    type: 'heading',
                    size: 1,
                    text: `Загрузка карточки ${dataCollection.title}...`
                },
            ]
            break
        case "ready":
            blocks = [
                ...(data.images?.poster?.[0]
                        ? [
                            {
                                type: 'photo',
                                photo: {
                                    type: 'photo',
                                    media: data.images.poster[0]
                                }
                            }
                        ]
                        : []
                ),

                name,
                personTmdbId,
                profession,
                personAge,
                placeOfBirth,

                ...awardBlock,
                ...factBlock,

                ...spaceRow,
                ...knownForBlock,

                socialBlock,

                {
                    type: 'divider'
                },
            ].filter(Boolean)
            break
    }

    return {
        blocks
    }
}

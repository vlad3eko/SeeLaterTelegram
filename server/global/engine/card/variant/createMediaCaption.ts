import {dateConvert} from "~/utils/convert/dateConvert";
import {
    dataCollectionMediaCard
} from "#server/global/engine/card/collectionCard/dataCollectionMediaCard";
import {CardData, statusRichCard} from "#server/global/engine/card/enum/types";

/** «1 ч 38 мин», «45 мин», «2 ч»; у сериала — длительность серии. */
const formatRuntime = (minutes: number | undefined): string => {
    if (!minutes || minutes <= 0) return ''
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return [hours ? `${hours} ч` : '', rest ? `${rest} мин` : ''].filter(Boolean).join(' ')
}

const money = (value: unknown): string =>
    Number(value) > 0 ? `${Number(value).toLocaleString('en-US')} $` : '—'

/** Блок в цитате: выделен цветом в карточке. */
const quote = (block: any) => ({type: 'blockquote', blocks: [block]})

/** Линия между блоками: сверху и снизу каждого свёрнутого блока, как на старых постах. */
const divider = {type: 'divider'}

const photo = (media: string) => ({type: 'photo', photo: {type: 'photo', media}})

/**
 * Карточка фильма или сериала (вариант «Компактная», решение владельца 20.11): сверху широкий
 * кадр (backdrop TMDB, вертикального постера нет), «Название · год», одна строка «⭐ рейтинг ·
 * жанры · длительность», комментарий администратора моноширинным шрифтом, остальное свёрнуто:
 * «Сюжет», «Актёры», «Подробнее». Без широкого кадра карточка начинается с названия.
 * Сериалы — та же карточка, в «Подробнее» добавлены число сезонов и серий и таблица сезонов.
 */
export const createMediaCaption = (
    preview: statusRichCard,
    data: CardData
): { blocks: any[] } => {

    const dataCollection = dataCollectionMediaCard(data)
    const {media, images} = data

    // images.poster: [постер, широкий кадр] (resolveCardStrategies, режим item).
    const wideImage = images?.poster?.[1] || undefined
    const year = dataCollection.date !== '-' ? dataCollection.date : ''
    const genres = (media.genres ?? [])
        .map((genre: {name?: string}) => String(genre?.name ?? '').toLowerCase())
        .filter(Boolean)
        .slice(0, 3)
        .join(', ')
    const runtime = formatRuntime(media.runtime || media.episode_run_time?.[0])
    const rating = dataCollection.rating !== '—' ? `⭐ ${dataCollection.rating}` : ''

    const titleLine = {
        type: 'heading',
        size: 1,
        text: year ? `${dataCollection.title} · ${year}` : dataCollection.title
    }
    const metaLine = {
        type: 'paragraph',
        text: [rating, genres, runtime].filter(Boolean).join(' · ') || dataCollection.mediaType
    }

    if (preview === 'pending') {
        return {
            blocks: [
                ...(wideImage ? [photo(wideImage)] : []),
                titleLine,
                metaLine,
                {
                    type: 'footer',
                    text: `Загружаю карточку ${dataCollection.mediaType}а…`
                }
            ]
        }
    }

    const hero = data.mediaOverride
        ? data.mediaOverride.type === 'video'
            ? {type: 'video', video: {type: 'video', media: data.mediaOverride.fileId}}
            : photo(data.mediaOverride.fileId)
        : wideImage
            ? photo(wideImage)
            : undefined

    const cast = (images?.postersList ?? []).filter(item => item?.fileId)

    const blocks: any[] = [
        ...(hero ? [hero] : []),
        titleLine,
        metaLine,

        // Комментарий администратора — моноширинным, сразу под строкой с рейтингом.
        ...(data.addComment
            ? [{type: 'paragraph', text: [{type: 'code', text: String(data.addComment)}]}]
            : []),

        // «Шахматка» (решение владельца 20.11): Сюжет — в цитате, Актёры — обычный блок
        // (в цитате только таблица), Подробнее — в цитате.
        divider,
        quote({
            type: 'details',
            summary: 'Сюжет',
            blocks: [
                ...(media.tagline ? [{type: 'pullquote', text: media.tagline}] : []),
                {type: 'paragraph', text: dataCollection.overview}
            ]
        }),

        ...(cast.length
            ? [divider, {
                type: 'details',
                summary: 'Актёры',
                blocks: [
                    {
                        type: 'collage',
                        blocks: cast.map(item => photo(item!.fileId))
                    },
                    quote({
                        type: 'table',
                        is_bordered: true,
                        is_compact: true,
                        cells: [
                            [{text: 'Имя', is_header: true}, {text: 'Роль', is_header: true}],
                            ...cast.map(item => [{text: item!.name}, {text: item!.role}])
                        ]
                    })
                ]
            }]
            : []),

        divider,
        quote({
            type: 'details',
            summary: 'Подробнее',
            blocks: [
                ...(dataCollection.originalTitle && dataCollection.originalTitle !== dataCollection.title
                    ? [{type: 'paragraph', text: `🎬 Оригинальное название: ${dataCollection.originalTitle}`}]
                    : []),
                {
                    type: 'paragraph',
                    text: `📅 Дата выхода: ${dateConvert(media.release_date || media.first_air_date) || '—'}`
                },
                ...((media.production_countries ?? []).length
                    ? [{
                        type: 'paragraph',
                        text: `🌍 Страны: ${media.production_countries.map((country: any) => country.name).join(' · ')}`
                    }]
                    : []),
                ...(Number(media.budget) > 0 || Number(media.revenue) > 0
                    ? [
                        {type: 'paragraph', text: `💰 Бюджет: ${money(media.budget)}`},
                        {type: 'paragraph', text: `💵 Сборы: ${money(media.revenue)}`}
                    ]
                    : []),
                ...(media.number_of_seasons
                    ? [{
                        type: 'paragraph',
                        text: `📺 Сезонов: ${media.number_of_seasons} · серий: ${media.number_of_episodes || '—'}`
                    }]
                    : []),
                {type: 'paragraph', text: `🍿 Оценок: ${Number(media.vote_count) || '—'}`},
                ...(media.seasons?.length
                    ? [{
                        type: 'table',
                        is_bordered: true,
                        is_compact: true,
                        cells: [
                            ['Сезон', 'Серий', 'Рейтинг', 'Дата'].map(text => ({text, is_header: true})),
                            ...media.seasons.map((season: any) => [
                                {text: String(season.name)},
                                {text: String(season.episode_count || 0)},
                                {text: String(season.vote_average || '—')},
                                {text: dateConvert(season.air_date) || '—'}
                            ])
                        ]
                    }]
                    : []),
                dataCollection.hasTrailer
                    ? {
                        type: 'paragraph',
                        text: [{
                            type: 'url',
                            text: '▶️ Смотреть трейлер',
                            url: `https://www.youtube.com/watch?v=${data.keyTrailer}`
                        }]
                    }
                    : {type: 'paragraph', text: '🎥 Трейлера пока нет'}
            ]
        }),
        divider
    ]

    return {
        blocks
    }
}

import {dateConvert} from "~/utils/convert/dateConvert";
import {genresConvert} from "~/utils/convert/genresConvert";
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

/** «100,000,000$», как на прежних постах; неизвестно — «—». */
const money = (value: unknown): string =>
    Number(value) > 0 ? `${Number(value).toLocaleString('en-US')}$` : '—'

/** Тег типа карточки: «фильм» → «#фильм», «мультсериал» → «#мультсериал» — для поиска по каналу. */
const hashtag = (text: string) => `#${text.replace(/[^а-яёА-ЯЁa-zA-Z0-9]/g, '')}`

/** Блок в цитате: выделен цветом в карточке. */
const quote = (block: any) => ({type: 'blockquote', blocks: [block]})

/** Линия между блоками: сверху и снизу каждого свёрнутого блока, как на старых постах. */
const divider = {type: 'divider'}

const photo = (media: string) => ({type: 'photo', photo: {type: 'photo', media}})

/** Сезоны сериала: название, серий, рейтинг, дата выхода. */
const seasonsTable = (seasons: any[]) => ({
    type: 'table',
    is_bordered: true,
    is_compact: true,
    cells: [
        ['Сезон', 'Серий', 'Рейтинг', 'Дата'].map(text => ({text, is_header: true})),
        ...seasons.map((season: any) => [
            {text: String(season.name)},
            {text: String(season.episode_count || 0)},
            {text: String(season.vote_average || '—')},
            {text: dateConvert(season.air_date) || '—'}
        ])
    ]
})

/**
 * Карточка фильма или сериала (вариант «Компактная», решение владельца 20.11): сверху широкий
 * кадр (backdrop TMDB, вертикального постера нет), «Название · год», одна строка «⭐ рейтинг ·
 * #жанры · длительность» (жанры хэштегами — для поиска по каналу, 21.11), комментарий
 * администратора моноширинным шрифтом, сюжет — открытой цитатой, «Актёры» и «Дополнительная
 * информация» (состав прежних постов) свёрнуты. Без широкого кадра карточка начинается с названия.
 * Сериалы — та же карточка, в «Дополнительной информации» ещё число сезонов и серий и таблица сезонов.
 */
export const createMediaCaption = (
    preview: statusRichCard,
    data: CardData
): { blocks: any[] } => {

    const dataCollection = dataCollectionMediaCard(data)
    const {media, images} = data

    // images.poster: [постер, широкий кадр] (resolveCardStrategies, режим item). Шапка карточки
    // (решение владельца 22.11): видео трейлера, без него широкий кадр, без него постер.
    const wideImage = images?.poster?.[1] || images?.poster?.[0] || undefined
    const year = dataCollection.date !== '-' ? dataCollection.date : ''
    // Жанры хэштегами (#драма • #история), как на прежних постах: по ним ищут в канале.
    const tags = media.genres?.length ? genresConvert(media.genres) : ''
    const typeTag = hashtag(dataCollection.mediaType)
    const countries = (media.production_countries ?? []).map((country: any) => country.name).join(' · ')
    const runtime = formatRuntime(media.runtime || media.episode_run_time?.[0])
    const rating = dataCollection.rating !== '—' ? `⭐ ${dataCollection.rating}` : ''

    const titleLine = {
        type: 'heading',
        size: 1,
        // Название моноширинным (как у персоны и в списках): по нажатию копируется только оно, без года.
        text: [{type: 'code', text: dataCollection.title}, ...(year ? [` · ${year}`] : [])]
    }
    const metaLine = {
        type: 'paragraph',
        text: [rating, tags, runtime].filter(Boolean).join(' · ') || typeTag
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

    // Видео трейлера — file_id из telegram_media_cache: его загружает финализатор при публикации
    // в канал (finalizeReelPublication), дальше карточки этого тайтла в боте показывают его же.
    const heroMedia = data.mediaOverride ?? (data.cardVideo ? {type: 'video' as const, fileId: data.cardVideo} : undefined)
    const hero = heroMedia
        ? heroMedia.type === 'video'
            ? {type: 'video', video: {type: 'video', media: heroMedia.fileId}}
            : photo(heroMedia.fileId)
        : wideImage
            ? photo(wideImage)
            : undefined

    const cast = (images?.postersList ?? []).filter(item => item?.fileId)

    const blocks: any[] = [
        ...(hero ? [hero] : []),
        titleLine,
        metaLine,

        // Оригинальное название — мелко под строкой, как на прежних постах.
        ...(dataCollection.originalTitle && dataCollection.originalTitle !== dataCollection.title
            ? [{type: 'footer', text: `original: «${dataCollection.originalTitle}»`}]
            : []),

        // Комментарий администратора — моноширинным, сразу под строкой с рейтингом.
        ...(data.addComment
            ? [{type: 'paragraph', text: [{type: 'code', text: String(data.addComment)}]}]
            : []),

        // Сюжет — открытой цитатой, как на прежних постах (решение владельца 21.11); у сериалов
        // в той же цитате сразу под сюжетом — таблица сезонов (22.11).
        divider,
        {
            type: 'blockquote',
            blocks: [
                {type: 'pullquote', text: dataCollection.overview},
                ...(media.seasons?.length ? [seasonsTable(media.seasons)] : [])
            ]
        },

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

        // «Дополнительная информация» — состав и порядок прежних постов (решение владельца 21.11);
        // жанры и тип — хэштегами: по ним ищут посты в канале. У сериалов — ещё сезоны и серии.
        divider,
        quote({
            type: 'details',
            summary: 'Дополнительная информация',
            blocks: [
                {type: 'paragraph', text: `💂🏼‍♀️ Страны: ${countries || '—'}`},
                {type: 'paragraph', text: `💰 Бюджет: ${money(media.budget)}`},
                {type: 'paragraph', text: `💰 Сборы: ${money(media.revenue)}`},
                {type: 'paragraph', text: `💎 imdb: ${dataCollection.rating !== '—' ? dataCollection.rating : '...'}`},
                {type: 'paragraph', text: `🍿 Голосов: ${Number(media.vote_count) || '...'}`},
                {type: 'paragraph', text: `⏳ Продолжительность: ${runtime || '-'}`},
                {type: 'paragraph', text: `📅 Дата выхода: ${dateConvert(media.release_date || media.first_air_date) || '...'}`},
                ...(media.number_of_seasons
                    ? [{
                        type: 'paragraph',
                        text: `📺 Сезонов: ${media.number_of_seasons} · серий: ${media.number_of_episodes || '—'}`
                    }]
                    : []),
                ...(tags ? [{type: 'paragraph', text: `Жанр: ${tags}`}] : []),
                {type: 'paragraph', text: [{type: 'bold', text: `Тип: ${typeTag}`}]},
                divider,
                dataCollection.hasTrailer
                    ? {
                        type: 'paragraph',
                        text: [{
                            type: 'url',
                            text: '🔥 Смотреть трейлер',
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

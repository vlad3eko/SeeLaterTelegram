import { dataCollectionMediaCard } from "#server/global/engine/card/collectionCard/dataCollectionMediaCard";
import { runtimeConvert } from "~/utils/convert/runtimeConvert";

type CreateInstagramCaptionParams = {
    media: any
    comment?: string
    overview?: string
    contentType?: string
}

const randomItem = <T>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)]

export const formatHumanDate = (date?: string) => {
    if (!date) {
        return ''
    }
    const [year, month, day] = date.split('-').map(Number)
    if (!year || !month || !day) {
        return ''
    }
    const months = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ]
    return `${day} ${months[month - 1]} ${year}`
}

type ReleaseStatus = 'past' | 'today' | 'soon' | 'future' | 'unknown'

const getReleaseStatus = (date?: string): ReleaseStatus => {
    if (!date) {
        return 'unknown'
    }
    const [year, month, day] = date.split('-').map(Number)
    if (!year || !month || !day) {
        return 'unknown'
    }
    const releaseDate = new Date(year, month - 1, day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    releaseDate.setHours(0, 0, 0, 0)
    const diff = releaseDate.getTime() - today.getTime()
    const dayMs = 1000 * 60 * 60 * 24
    const daysUntilRelease = Math.ceil(diff / dayMs)
    if (daysUntilRelease < 0) {
        return 'past'
    }
    if (daysUntilRelease === 0) {
        return 'today'
    }
    if (daysUntilRelease <= 30) {
        return 'soon'
    }
    return 'future'
}

export const createInstagramCaption = ({
                                           media,
                                           comment,
                                           overview,
                                           contentType
                                       }: CreateInstagramCaptionParams) => {
    const dataCollection = dataCollectionMediaCard({
        media,
        contentType: contentType || media.media_type || 'movie',
        addComment: comment,
        addOverview: overview
    })
    const title = dataCollection.title
    const releaseDate = media.release_date || media.first_air_date
    const humanDate = formatHumanDate(releaseDate)
    const releaseStatus = getReleaseStatus(releaseDate)
    const description = dataCollection.overview
    const mediaType = dataCollection.mediaType.toLowerCase()
    const actors = Array.isArray(media.credits)
        ? media.credits
            .filter((person: any) =>
                person?.name &&
                person?.character &&
                person?.known_for_department === 'Acting'
            )
            .sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999))
            .slice(0, 5)
        : []
    const actorNames = actors.map((actor: any) => actor.name).join(', ')
    const runtime = media.runtime ? runtimeConvert(media.runtime) : ''
    const editorComment = dataCollection.data.addComment?.trim()
    const tagline = media.tagline?.trim()
    const introVariants: string[] = []

    switch (releaseStatus) {
        case 'past':
            introVariants.push(
                humanDate ? `🍿 ${title} уже вышел ${humanDate}.` : `🍿 Уже вышел ${title}.`,
                humanDate ? `🎬 Встречаем новую премьеру — ${title}. Он вышел ${humanDate}.` : `🎬 Встречаем новую премьеру — ${title}.`,
                humanDate ? `🎬 Премьера ${title} состоялась ${humanDate}.` : `🎬 Премьера ${title} уже состоялась.`,
                `⚡️ ${title} уже появился в сети.`,
                `🤩 Вышел новый ${mediaType} — ${title}.`,
                `📺 ${title} уже можно посмотреть.`,
                `🎬 ${title} наконец вышел.`,
                `🔥 Добрались до новой премьеры — ${title}.`,
                `📼 ${title} уже появился в сети.`,
                humanDate ? `⚡️ ${title} вышел ${humanDate}.` : `⚡️ ${title} уже вышел.`,
                humanDate ? `📺 Новинка уже в сети — ${title}. Премьера состоялась ${humanDate}.` : `📺 Новинка уже в сети — ${title}.`,
                `🤦 Ещё одна новинка добралась до нас — ${title}.`,
                `⭐️ Похоже, у нас очередная новинка — ${title}.`
            )
            break
        case 'today':
            introVariants.push(
                `🍿 ${title} вышел сегодня.`,
                `🎬 Сегодня состоялась премьера ${title}.`,
                `🔥 Дождались — ${title} уже вышел сегодня.`,
                `⚡️ Премьера ${title} состоялась сегодня.`,
                `📺 ${title} уже можно смотреть — он вышел сегодня.`,
                `🤩 Сегодня наконец вышел ${mediaType} — ${title}.`,
                `🎬 День премьеры — ${title} уже вышел.`,
                `🍿 Дождались премьеры — ${title} уже в сети.`
            )
            break
        case 'soon':
            introVariants.push(
                `🎬 Скоро выйдет ${title} — премьера ${humanDate}.`,
                `🍿 Премьера ${title} уже близко — ${humanDate}.`,
                `🔥 Совсем скоро выйдет ${title}. Премьера — ${humanDate}.`,
                `👀 Ждать осталось недолго — ${title} выйдет ${humanDate}.`,
                `⚡️ ${title} уже на подходе — премьера ${humanDate}.`,
                `🎬 Скоро в кино — ${title}. Премьера ${humanDate}.`,
                `📺 Скоро выйдет новый ${mediaType} — ${title}. Дата премьеры — ${humanDate}.`,
                `🤩 До премьеры ${title} осталось совсем немного — ${humanDate}.`,
                `🍿 ${title} уже скоро появится — премьера ${humanDate}.`,
                `🔥 Премьера уже близко — ${title} выйдет ${humanDate}.`
            )
            break
        case 'future':
            introVariants.push(
                `🎬 ${title} выйдет ${humanDate}.`,
                `🍿 Премьера ${title} состоится ${humanDate}.`,
                `👀 Ждём ${title} — премьера ${humanDate}.`,
                `⚡️ ${title} уже на горизонте — выйдет ${humanDate}.`,
                `🎬 Запоминаем дату — ${title} выйдет ${humanDate}.`,
                `🔥 В планах на будущее — ${title}. Премьера ${humanDate}.`,
                `📺 Новый ${mediaType}, который стоит ждать — ${title}. Премьера ${humanDate}.`,
                `🤩 ${title} ещё впереди — премьера состоится ${humanDate}.`,
                `🍿 До премьеры ${title} ещё есть время — ждём ${humanDate}.`,
                `👀 Если ждёте ${title}, запоминайте дату — ${humanDate}.`
            )
            break
        case 'unknown':
            introVariants.push(
                `🎬 Есть что добавить в список на просмотр — ${title}.`,
                `🍿 Если вы ждали новый ${mediaType}, то это он — ${title}.`,
                `🎬 Новинка, которую стоит заметить — ${title}.`,
                `👀 А вот и ещё один ${mediaType}, который появился в нашей ленте — ${title}.`,
                `⚡️ Есть новости для тех, кто ждал ${title}.`
            )
            break
    }

    const intro = randomItem(introVariants)
    const commentVariants = [editorComment, tagline].filter(Boolean)
    const commentText = commentVariants.length ? randomItem(commentVariants) : ''

    const storyVariants = [
        description ? `Сюжет: ${description}` : '',
        description ? `По сюжету, ${description.charAt(0).toLowerCase()}${description.slice(1)}` : '',
        description ? `История начинается с того, что ${description.charAt(0).toLowerCase()}${description.slice(1)}` : '',
        description ? description : '',
        description ? `По сюжету фильма, ${description.charAt(0).toLowerCase()}${description.slice(1)}` : '',
        description ? `В центре истории — ${description.charAt(0).toLowerCase()}${description.slice(1)}` : '',
        description ? `История здесь такая: ${description.charAt(0).toLowerCase()}${description.slice(1)}` : '',
        description ? `Если коротко о сюжете: ${description.charAt(0).toLowerCase()}${description.slice(1)}` : ''
    ].filter(Boolean)

    const story = storyVariants.length ? randomItem(storyVariants) : ''

    const castVariants = [
        actorNames ? `В ролях: ${actorNames}.` : '',
        actorNames ? `В главных ролях — ${actorNames}.` : '',
        actorNames ? `Кстати, в касте: ${actorNames}.` : '',
        actorNames ? `Актёрский состав: ${actorNames}.` : ''
    ].filter(Boolean)

    const cast = castVariants.length ? randomItem(castVariants) : ''
    const details: string[] = []

    if (dataCollection.genres) {
        details.push(`Жанр — ${dataCollection.genres.toLowerCase()}.`)
    }
    if (runtime) {
        details.push(`Продолжительность — ${runtime}.`)
    }

    const endingVariants = [
        'Кто-нибудь уже смотрит?', 'Будете смотреть?', 'Кто уже успел посмотреть?',
        'Ну что, добавляем в список?', 'Кто уже знаком с этой историей?', 'Как вам новинка?',
        'Кто планирует смотреть?', 'Кто заинтересован?', 'Кто будет смотреть?',
        'Кто уже посмотрел?', 'Добавляем в список?', 'Стоит смотреть?',
        'Кто ждал эту новинку?', 'Кто уже успел добраться до неё?', 'Как вам эта премьера?',
        'Будете смотреть или пропускаем?'
    ]

    const ending = randomItem(endingVariants)
    const parts = [intro, commentText, story, cast, details.join(' '), ending].filter(Boolean)

    return parts.join('\n\n')
}

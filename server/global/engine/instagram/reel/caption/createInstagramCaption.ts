import {
    dataCollectionMediaCard
} from "#server/global/engine/card/collectionCard/dataCollectionMediaCard";
import {runtimeConvert} from "~/utils/convert/runtimeConvert";

type CreateInstagramCaptionParams = {
    media: any
    comment?: string
    overview?: string
    contentType?: string
}

const randomItem = <T>(items: T[]): T | undefined =>
    items[Math.floor(Math.random() * items.length)]

const formatHumanDate = (date?: string) => {

    if (!date) {
        return ''
    }

    const [year, month, day] =
        date.split('-').map(Number)

    if (!year || !month || !day) {
        return ''
    }

    const months = [
        'января',
        'февраля',
        'марта',
        'апреля',
        'мая',
        'июня',
        'июля',
        'августа',
        'сентября',
        'октября',
        'ноября',
        'декабря'
    ]

    return `${day} ${months[month - 1]} ${year}`
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

    const title =
        dataCollection.title

    const humanDate =
        formatHumanDate(
            media.release_date ||
            media.first_air_date
        )

    const description =
        dataCollection.overview

    const mediaType =
        dataCollection.mediaType.toLowerCase()

    /*
     * Актёры
     */

    const actors = Array.isArray(media.credits)
        ? media.credits
            .filter((person: any) =>
                person?.name &&
                person?.character &&
                person?.known_for_department === 'Acting'
            )
            .sort(
                (a: any, b: any) =>
                    (a.order ?? 999) -
                    (b.order ?? 999)
            )
            .slice(0, 5)
        : []

    const actorNames =
        actors
            .map((actor: any) => actor.name)
            .join(', ')

    /*
     * Дополнительные данные
     */

    const runtime =
        media.runtime
            ? runtimeConvert(media.runtime)
            : ''

    const editorComment =
        dataCollection.data.addComment?.trim()

    const tagline =
        media.tagline?.trim()

    /*
     * Вступление
     */

    const introVariants = [
        /*
         * Текущие варианты
         */

        humanDate
            ? `🍿 ${title} уже вышел ${humanDate}.`
            : `🍿 Уже вышел ${title}.`,

        humanDate
            ? `🎬 Встречаем новую премьеру — ${title}. Он вышел ${humanDate}.`
            : `🎬 Встречаем новую премьеру — ${title}.`,

        humanDate
            ? `🎬 Премьера ${title} состоялась ${humanDate}.`
            : `🎬 Премьера ${title} уже состоялась.`,

        `🎬 Есть что добавить в список на просмотр — ${title}.`,

        `🍿 Если вы ждали новый ${mediaType}, то это он — ${title}.`,

        `🎬 Новинка, которую стоит заметить — ${title}.`,

        `👀 А вот и ещё один ${mediaType}, который появился в нашей ленте — ${title}.`,

        /*
         * Новые варианты
         */

        `⚡️ ${title} уже появился в сети.`,

        `🤩 Вышел новый ${mediaType} — ${title}.`,

        `📺 ${title} уже можно посмотреть.`,

        `🎬 ${title} наконец вышел.`,

        `🔥 Добрались до новой премьеры — ${title}.`,

        `⚡️ Есть новости для тех, кто ждал ${title}.`,

        humanDate
            ? `⚡️ ${title} вышел ${humanDate}.`
            : `⚡️ ${title} уже вышел.`,

        humanDate
            ? `📺 Новинка уже в сети — ${title}. Премьера состоялась ${humanDate}.`
            : `📺 Новинка уже в сети — ${title}.`,

        `🤦 Ещё одна новинка добралась до нас — ${title}.`,

        `📼 ${title} уже появился в сети.`,

        `⭐️ Похоже, у нас очередная новинка — ${title}.`
    ]

    const intro =
        randomItem(introVariants)

    /*
     * Комментарий / слоган
     */

    const commentVariants = [
        editorComment,
        tagline
    ].filter(Boolean)

    const commentText =
        commentVariants.length
            ? randomItem(commentVariants)
            : ''

    /*
     * Сюжет
     */

    const storyVariants = [
        description
            ? `Сюжет: ${description}`
            : '',

        description
            ? `По сюжету, ${description.charAt(0).toLowerCase()}${description.slice(1)}`
            : '',

        description
            ? `История начинается с того, что ${description.charAt(0).toLowerCase()}${description.slice(1)}`
            : '',

        description
            ? description
            : '',

        /*
         * Новые варианты
         */

        description
            ? `По сюжету фильма, ${description.charAt(0).toLowerCase()}${description.slice(1)}`
            : '',

        description
            ? `В центре истории — ${description.charAt(0).toLowerCase()}${description.slice(1)}`
            : '',

        description
            ? `История здесь такая: ${description.charAt(0).toLowerCase()}${description.slice(1)}`
            : '',

        description
            ? `Если коротко о сюжете: ${description.charAt(0).toLowerCase()}${description.slice(1)}`
            : ''
    ].filter(Boolean)

    const story =
        storyVariants.length
            ? randomItem(storyVariants)
            : ''

    /*
     * Актёры
     */

    const castVariants = [
        actorNames
            ? `В ролях: ${actorNames}.`
            : '',

        actorNames
            ? `В главных ролях — ${actorNames}.`
            : '',

        actorNames
            ? `Кстати, в касте: ${actorNames}.`
            : '',

        actorNames
            ? `Актёрский состав: ${actorNames}.`
            : ''
    ].filter(Boolean)

    const cast =
        castVariants.length
            ? randomItem(castVariants)
            : ''

    /*
     * Дополнительная информация
     */

    const details: string[] = []

    if (dataCollection.genres) {
        details.push(
            `Жанр — ${dataCollection.genres.toLowerCase()}.`
        )
    }

    if (runtime) {
        details.push(
            `Продолжительность — ${runtime}.`
        )
    }

    /*
     * Финальная фраза
     */

    const endingVariants = [
        'Кто-нибудь уже смотрит?',

        'Будете смотреть?',

        'Кто уже успел посмотреть?',

        'Ну что, добавляем в список?',

        'Кто уже знаком с этой историей?',

        'Как вам новинка?',

        'Кто планирует смотреть?',

        /*
         * Новые варианты
         */

        'Кто заинтересован?',

        'Кто будет смотреть?',

        'Кто уже посмотрел?',

        'Добавляем в список?',

        'Стоит смотреть?',

        'Кто ждал эту новинку?',

        'Кто уже успел добраться до неё?',

        'Как вам эта премьера?',

        'Будете смотреть или пропускаем?'
    ]

    const ending =
        randomItem(endingVariants)

    /*
     * Собираем caption
     */

    const parts = [
        intro,
        commentText,
        story,
        cast,
        details.join(' '),
        ending
    ].filter(Boolean)

    return parts.join('\n\n')
}

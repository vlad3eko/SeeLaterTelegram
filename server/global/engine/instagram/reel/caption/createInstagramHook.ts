import {ContentType} from "#server/global/engine/search/strategy/enums"
import {contentTypeConvert} from "~/utils/convert/contentTypeConvert";

// Запасной хук: используется, только когда Gemini не ответил. Видео здесь никто
// не смотрел, поэтому хук может опираться лишь на то, что известно о фильме, и
// не имеет права ничего обещать про качество («шедевр», «разобьёт сердце»).
//
// Порядок выбора:
//   1. слоган самого фильма из TMDB, если он подходит по длине и языку;
//   2. нейтральный хук под жанр;
//   3. нейтральный хук под тип контента.
//
// Хук делится на две строки по ~25 знаков (decorateInstagramVideo), поэтому
// каждая фраза: 3–7 слов, не длиннее ~48 символов. Хук, который начинается со
// слова-типа («ФИЛЬМ», «СЕРИАЛ»…), получает цветное выделение этого слова.

const HOOK_TEMPLATES: Record<string, string[]> = {
    movie: [
        'ЕСЛИ НЕ ЗНАЕТЕ, ЧТО СМОТРЕТЬ ЭТИМ ВЕЧЕРОМ',
        'ФИЛЬМ НА ВЕЧЕР: РЕШАЙТЕ ПО ПЕРВЫМ КАДРАМ',
        'ЧТО ЗА ФИЛЬМ? ПОСМОТРИМ ВМЕСТЕ',
        'ВЫБИРАЕМ ФИЛЬМ НА СЕГОДНЯШНИЙ ВЕЧЕР'
    ],

    series: [
        'СЕРИАЛ НА ВЕЧЕР: РЕШАЙТЕ ПО ПЕРВЫМ КАДРАМ',
        'ЕСЛИ ИЩЕТЕ СЕРИАЛ НА ЭТИ ВЫХОДНЫЕ',
        'ЧТО ЗА СЕРИАЛ? ПОСМОТРИМ ВМЕСТЕ',
        'ВЫБИРАЕМ СЕРИАЛ НА БЛИЖАЙШИЕ ВЕЧЕРА'
    ],

    cartoon: [
        'МУЛЬТФИЛЬМ НА ВЕЧЕР: РЕШАЙТЕ ПО ПЕРВЫМ КАДРАМ',
        'ЕСЛИ ХОЧЕТСЯ МУЛЬТФИЛЬМ НА ВЕЧЕР',
        'ЧТО ЗА МУЛЬТФИЛЬМ? ПОСМОТРИМ ВМЕСТЕ',
        'ВЫБИРАЕМ МУЛЬТФИЛЬМ НА СЕГОДНЯ'
    ],

    cartoonSeries: [
        'МУЛЬТСЕРИАЛ НА ВЕЧЕР: РЕШАЙТЕ ПО КАДРАМ',
        'ЕСЛИ ХОЧЕТСЯ МУЛЬТСЕРИАЛ НА ВЕЧЕР',
        'ЧТО ЗА МУЛЬТСЕРИАЛ? ПОСМОТРИМ ВМЕСТЕ',
        'ВЫБИРАЕМ МУЛЬТСЕРИАЛ НА СЕГОДНЯ'
    ],

    anime: [
        'АНИМЕ НА ВЕЧЕР: РЕШАЙТЕ ПО ПЕРВЫМ КАДРАМ',
        'ЕСЛИ ИЩЕТЕ АНИМЕ НА ЭТОТ ВЕЧЕР',
        'ЧТО ЗА АНИМЕ? ПОСМОТРИМ ВМЕСТЕ',
        'ВЫБИРАЕМ АНИМЕ НА СЕГОДНЯ'
    ]
};

// Жанровые хуки. Ни в одном нет слов «фильм» и «сериал», чтобы фраза подходила
// и к тому, и к другому. Порядок важен: берётся первый жанр из списка, который
// есть у фильма. Драма стоит последней, она встречается почти везде.
// id — жанры TMDB, регулярка — запасной вариант по русскому названию.
const GENRE_HOOKS: Array<{
    ids: number[]
    pattern: RegExp
    hooks: string[]
}> = [
    {
        ids: [27],
        pattern: /ужас/i,
        hooks: [
            'ТЫ БЫ ДОСМОТРЕЛ ЭТО ДО КОНЦА?',
            'СМОТРЕТЬ ТОЛЬКО С ВКЛЮЧЁННЫМ СВЕТОМ',
            'КТО ИЗ ВАС ЛЮБИТ БОЯТЬСЯ?'
        ]
    },
    {
        ids: [53, 80, 9648],
        pattern: /триллер|детектив|криминал|мистик/i,
        hooks: [
            'ПОПРОБУЙ УГАДАТЬ, ЧЕМ ВСЁ ЗАКОНЧИТСЯ',
            'КТО В ЭТОЙ ИСТОРИИ ГОВОРИТ ПРАВДУ?',
            'УГАДАЕШЬ, КТО ТУТ ВИНОВАТ?'
        ]
    },
    {
        ids: [878, 14, 10765],
        pattern: /фантаст|фэнтези|нф/i,
        hooks: [
            'ЧТО, ЕСЛИ ТАКОЙ МИР СУЩЕСТВУЕТ?',
            'МИР, В КОТОРЫЙ ХОЧЕТСЯ ЗАГЛЯНУТЬ',
            'ЕСЛИ ЛЮБИТЕ ВЫДУМАННЫЕ МИРЫ'
        ]
    },
    {
        ids: [28, 12, 10759],
        pattern: /боевик|приключ/i,
        hooks: [
            'ЕСЛИ НУЖЕН ЭКШЕН БЕЗ ЛИШНИХ СЛОВ',
            'КОГДА ХОЧЕТСЯ ДИНАМИКИ, А НЕ РАЗГОВОРОВ'
        ]
    },
    {
        ids: [35],
        pattern: /комеди/i,
        hooks: [
            'СМОЖЕТЕ НЕ ЗАСМЕЯТЬСЯ? ПРОВЕРИМ',
            'ЮМОР, КОТОРЫЙ ЛИБО ЗАЙДЁТ, ЛИБО НЕТ',
            'ЕСЛИ ХОЧЕТСЯ ПОСМЕЯТЬСЯ, А НЕ ДУМАТЬ'
        ]
    },
    {
        ids: [10749],
        pattern: /мелодрам|романт/i,
        hooks: [
            'ЕСЛИ ХОЧЕТСЯ ИСТОРИИ ПРО ЛЮБОВЬ',
            'ПОВЕРИТЕ ЛИ ВЫ В ТАКУЮ ЛЮБОВЬ?'
        ]
    },
    {
        ids: [18],
        pattern: /драм/i,
        hooks: [
            'ТУТ У КАЖДОГО СВОЯ ПРАВДА',
            'ЧТО БЫ ВЫ СДЕЛАЛИ ВМЕСТО ГЕРОЕВ?'
        ]
    }
]

type HookMedia = {
    tagline?: unknown
    genres?: Array<{ id?: number, name?: string } | string>
}

const randomItem = <T>(items: T[]): T | undefined =>
    items[Math.floor(Math.random() * items.length)]

// Слоган фильма пишет человек и он конкретнее любой заготовки. Берём его, только
// если он по-русски и помещается в хук: 3–7 слов, не длиннее 48 символов.
const pickTagline = (value: unknown): string => {
    const text = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^["'«“„]+|["'»”]+$/gu, '')
        .replace(/\.+$/u, '')
        .trim()

    if (!text || text.length > 48) {
        return ''
    }

    const words = text.split(' ').filter(word => /[\p{L}\p{N}]/u.test(word))

    if (words.length < 3 || words.length > 7) {
        return ''
    }

    const letters = text.match(/\p{L}/gu) ?? []
    const cyrillic = text.match(/[А-Яа-яЁё]/g) ?? []

    if (!letters.length || cyrillic.length / letters.length < 0.8) {
        return ''
    }

    return text
}

const findGenreHooks = (genres?: HookMedia['genres']): string[] | undefined => {
    if (!Array.isArray(genres) || !genres.length) {
        return undefined
    }

    const normalized = genres.map(genre =>
        typeof genre === 'string'
            ? {id: undefined, name: genre}
            : {id: genre?.id, name: genre?.name ?? ''}
    )

    const match = GENRE_HOOKS.find(({ids, pattern}) =>
        normalized.some(genre =>
            (genre.id !== undefined && ids.includes(genre.id)) ||
            pattern.test(genre.name)
        )
    )

    return match?.hooks
}

export const createInstagramHook = (
    mediaType: string,
    contentType: ContentType,
    media?: HookMedia
): string => {
    if (!mediaType || !contentType) {
        return ''
    }

    const typeHooks = HOOK_TEMPLATES[contentType]

    if (!typeHooks?.length) {
        return ''
    }

    const tagline = pickTagline(media?.tagline)

    if (tagline) {
        return tagline
    }

    return randomItem(findGenreHooks(media?.genres) ?? typeHooks) ?? ''
}

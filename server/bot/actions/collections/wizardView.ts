import {Markup} from 'telegraf'
import {COLLECTION_ACTION} from '#server/bot/callbacks/routes'
import {
    GENRES,
    genreByKey,
    type Period,
    periodByKey,
    SECTIONS,
    TAG_GROUPS,
    tagByKey,
    tagsForSection,
    YEAR_RANGES,
    yearRangeByKey
} from '#server/global/engine/collections/catalog'
import type {SectionGroup, WizardState} from '#server/bot/actions/collections/wizardState'

/** Текст и кнопки мастера подборки для текущего состояния. */

type ButtonStyle = 'success' | 'danger' | 'primary'

/**
 * Кнопка мастера. style — цвет кнопки (Bot API: success — зелёная, danger — красная,
 * primary — синяя; старые клиенты Telegram показывают обычную). Решение владельца 18.11:
 * шаги вперёд — зелёные, «Сбросить» и «Назад» — красные.
 */
export const btn = (text: string, action: string, arg?: string, style?: ButtonStyle) => ({
    ...Markup.button.callback(text, COLLECTION_ACTION.encode({action, ...(arg ? {arg} : {})})),
    ...(style ? {style} : {})
})

/** Неактивная кнопка (Bot API 10.3, DisabledButton): видна, но ничего не делает. */
const disabledBtn = (text: string) => ({text, disabled: {}})

const escapeHtml = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const GROUPS: Array<{key: SectionGroup, label: string, ready: boolean}> = [
    {key: 'movies', label: '🎬 Фильмы', ready: true},
    {key: 'series', label: '📺 Сериалы', ready: true},
    {key: 'cartoons', label: '🧸 Мультфильмы', ready: false},
    {key: 'cseries', label: '🎨 Мультсериалы', ready: false},
    {key: 'anime', label: '🌸 Аниме', ready: false},
    {key: 'people', label: '🎭 Актёры и режиссёры', ready: false}
]

export const CRITERION_LABEL = {filter: 'Фильтр', popular: 'Популярное'} as const
export const DIRECTION_LABEL = {released: 'Уже вышли', upcoming: 'Скоро'} as const

/** У «Сериалы · Скоро» год не выбирается: первая серия ещё впереди. */
export const yearLocked = (state: WizardState) => state.section === 'series_upcoming'

/*
 * Текст мастера и подборки — строки из кусков с inline-стилями (жирный, курсив, ссылка),
 * из которых собираются и rich-сообщение, и запасной HTML. Вопрос экрана крупно написан на
 * обложке, поэтому в тексте — только путь, выбранное и короткая подсказка.
 */

export type TextPart = {text: string, bold?: boolean, italic?: boolean, url?: string}
export type TextLine = {quote?: boolean, parts: TextPart[]}

const plain = (text: string): TextPart => ({text})
const bold = (text: string): TextPart => ({text, bold: true})
const italic = (text: string): TextPart => ({text, italic: true})
const quote = (text: string): TextLine => ({quote: true, parts: [italic(text)]})

/**
 * Шаг пути «Меню › Фильмы › Фильтр › уже вышли». Каждый, кроме последнего, — ссылка
 * t.me/<бот>?start=g_<шаг>: нажатие возвращает мастер на экран сразу после этого выбора
 * (обработчик — jumpCollections).
 */
export type CrumbStep = 'home' | 'group' | 'section' | 'criterion' | 'direction'
export const CRUMB_STEPS: readonly CrumbStep[] = ['home', 'group', 'section', 'criterion', 'direction']

const crumbsOf = (state: WizardState, period?: string): Array<{label: string, step?: CrumbStep}> => {
    const crumbs: Array<{label: string, step?: CrumbStep}> = [{label: 'Меню', step: 'home'}]
    const group = GROUPS.find(item => item.key === state.group)
    if (group) crumbs.push({label: group.label.replace(/^\S+\s/, ''), step: 'group'})
    if (state.group === 'series' && state.section) crumbs.push({label: SECTIONS[state.section].label.toLowerCase(), step: 'section'})
    if (state.criterion) crumbs.push({label: CRITERION_LABEL[state.criterion], step: 'criterion'})
    if (state.direction && state.group === 'movies') crumbs.push({label: DIRECTION_LABEL[state.direction].toLowerCase(), step: 'direction'})
    if (period) crumbs.push({label: period})
    return crumbs
}

const crumbLine = (state: WizardState, bot?: string, period?: string): TextLine => {
    const crumbs = crumbsOf(state, period)
    const parts: TextPart[] = []
    crumbs.forEach((crumb, index) => {
        if (index) parts.push(plain(' › '))
        const last = index === crumbs.length - 1
        parts.push({
            ...bold(crumb.label),
            ...(crumb.step && !last && bot ? {url: `https://t.me/${bot}?start=g_${crumb.step}`} : {})
        })
    })
    return {parts}
}

/** «драма, комедия» — каждое значение жирным. */
const boldList = (labels: string[]): TextPart[] =>
    labels.flatMap((label, index) => index ? [plain(', '), bold(label)] : [bold(label)])

/** Жанры, теги и год фильтра: на экране фильтра — все поля, дальше — только заполненные. */
const filterLines = (state: WizardState, full: boolean): TextLine[] => {
    if (state.criterion !== 'filter') return []
    const genres = state.genres.map(key => genreByKey(key)?.label.toLowerCase()).filter((label): label is string => Boolean(label))
    const tags = state.tags.map(key => tagByKey(key)?.label.toLowerCase()).filter((label): label is string => Boolean(label))
    const year = yearRangeByKey(state.year)?.label
    const withYear = !yearLocked(state)

    if (full) {
        return [
            {parts: [italic('Жанры'), plain(' '), ...(genres.length ? boldList(genres) : [plain('—')])]},
            {parts: [
                italic('Теги'), plain(' '), ...(tags.length ? boldList(tags) : [plain('—')]),
                ...(withYear ? [plain('  ·  '), italic('Год'), plain(' '), year ? bold(year) : plain('любой')] : [])
            ]}
        ]
    }

    const fields: TextPart[][] = []
    if (genres.length) fields.push([italic('Жанры'), plain(' '), ...boldList(genres)])
    if (tags.length) fields.push([italic('Теги'), plain(' '), ...boldList(tags)])
    if (withYear && year) fields.push([italic('Год'), plain(' '), bold(year)])
    if (!fields.length) return []
    return [{parts: fields.flatMap((field, index) => index ? [plain('  ·  '), ...field] : field)}]
}

const HINT: Record<WizardState['screen'], string> = {
    home: 'Выберите режим.',
    root: 'Выберите раздел.',
    series: 'Уже вышли целиком, выходят новые серии или скоро стартуют.',
    criterion: 'Фильтр — сами отметите жанры, теги и год. Популярное — самое смотримое.',
    filter: '',
    direction: 'Уже в кино и онлайн — или премьеры ещё впереди.',
    period: 'В скобках — сколько нашлось с трейлером.',
    result: '',
    title: ''
}

const FILTER_HINT: TextLine = {quote: true, parts: [
    italic('Сначала ищу тайтлы со '), {text: 'всеми', bold: true, italic: true},
    italic(' отметками, если их мало — с '), {text: 'любой', bold: true, italic: true}, italic(' из них.')
]}

/** Строки → блоки rich-сообщения. */
export const richBlocks = (lines: TextLine[]): any[] => lines.map(line => {
    const text = line.parts.map(part => {
        let node: any = part.text
        if (part.italic) node = {type: 'italic', text: node}
        if (part.bold) node = {type: 'bold', text: part.italic ? [node] : node}
        return part.url ? {type: 'url', text: [node], url: part.url} : node
    })
    return line.quote
        ? {type: 'blockquote', blocks: [{type: 'paragraph', text}]}
        : {type: 'paragraph', text}
})

/** Строки → HTML (запасной вид, если rich-сообщение не принято). */
const htmlText = (lines: TextLine[]): string => lines.map(line => {
    const html = line.parts.map(part => {
        let value = escapeHtml(part.text)
        if (part.italic) value = `<i>${value}</i>`
        if (part.bold) value = `<b>${value}</b>`
        return part.url ? `<a href="${part.url}">${value}</a>` : value
    }).join('')
    return line.quote ? `<blockquote>${html}</blockquote>` : html
}).join('\n\n')

/** Число на кнопке периода: «(5)», «(40+)»; undefined — ещё считается. */
export type PeriodCounts = Partial<Record<string, {count: number, capped: boolean}>>

const countLabel = (count?: {count: number, capped: boolean}) =>
    !count ? '' : ` (${count.count}${count.capped ? '+' : ''})`

export type RenderOptions = {
    note?: string
    counts?: PeriodCounts
    /** Идёт подсчёт: вместо вопроса — «Подсчёт вариантов». */
    counting?: boolean
    /** Периоды, которые есть смысл показывать (пересекаются с блоком «Год»). */
    periods?: Period[]
    /** Идёт сборка подборки: обложка «Собираю топ…». */
    building?: boolean
    /** Выбранный период (при сборке) — последним шагом пути. */
    period?: string
    /** Username бота для ссылок пути; без него путь — просто текст. */
    bot?: string
}

export const renderWizard = (state: WizardState, options: RenderOptions = {}) => {
    const {note, counts, counting, periods = []} = options
    const hint = HINT[state.screen]
    const lines: TextLine[] = [
        crumbLine(state, options.bot, options.period),
        ...filterLines(state, state.screen === 'filter'),
        ...(counting ? [quote('⏳ Подсчёт вариантов…')]
            : note ? [quote(note)]
                : state.screen === 'filter' ? [FILTER_HINT]
                    : hint ? [{parts: [italic(hint)]}] : [])
    ]
    const text = htmlText(lines)

    const rows: any[][] = []
    const back = [btn('◀️ Назад', 'b', undefined, 'danger')]

    switch (state.screen) {
        case 'home':
            rows.push([btn('🎞 Подборка', 'm', undefined, 'success')])
            rows.push([btn('✖️ Закрыть', 'x', undefined, 'danger')])
            break
        case 'root': {
            for (let i = 0; i < GROUPS.length; i += 2) {
                rows.push(GROUPS.slice(i, i + 2).map(group => group.ready
                    ? btn(group.label, 's', group.key, 'success')
                    : btn(`${group.label} · скоро`, 's', group.key)))
            }
            rows.push(back)
            break
        }
        case 'series':
            rows.push([btn('✅ Вышли полностью', 'ss', 'series_completed', 'success')])
            rows.push([btn('🆕 Новые серии/сезоны', 'ss', 'series_new', 'success')])
            rows.push([btn('🔜 Скоро', 'ss', 'series_upcoming', 'success')])
            rows.push(back)
            break
        case 'criterion':
            rows.push([btn('🔎 Фильтр', 'c', 'filter', 'success'), btn('🔥 Популярное', 'c', 'popular', 'success')])
            rows.push(back)
            break
        case 'filter': {
            const section = state.section ? SECTIONS[state.section] : SECTIONS.movies
            rows.push([btn(`${state.openGenres ? '▼' : '▶'} Жанры${state.genres.length ? ` (выбрано ${state.genres.length})` : ''}`, 'f', 'g', 'primary')])
            if (state.openGenres) {
                const genreButtons = GENRES.map(genre =>
                    btn(`${state.genres.includes(genre.key) ? '✅ ' : ''}${genre.label}`, 'tg', genre.key))
                for (let i = 0; i < genreButtons.length; i += 3) rows.push(genreButtons.slice(i, i + 3))
            }
            rows.push([btn(`${state.openTags ? '▼' : '▶'} Теги${state.tags.length ? ` (выбрано ${state.tags.length})` : ''}`, 'f', 't', 'primary')])
            if (state.openTags) {
                const tags = tagsForSection(section)
                for (const [group, groupLabel] of Object.entries(TAG_GROUPS)) {
                    const groupTags = tags.filter(tag => tag.group === group)
                    if (!groupTags.length) continue
                    rows.push([disabledBtn(`— ${groupLabel} —`)])
                    const tagButtons = groupTags.map(tag =>
                        btn(`${state.tags.includes(tag.key) ? '✅ ' : ''}${tag.label}`, 'tt', tag.key))
                    for (let i = 0; i < tagButtons.length; i += 2) rows.push(tagButtons.slice(i, i + 2))
                }
            }
            if (yearLocked(state)) {
                rows.push([disabledBtn('🔒 Год — для «Скоро» не выбирается')])
            } else {
                rows.push([btn(`${state.openYear ? '▼' : '▶'} Год${state.year ? ` (${yearRangeByKey(state.year)?.label})` : ''}`, 'f', 'y', 'primary')])
                if (state.openYear) {
                    rows.push(YEAR_RANGES.map(range => btn(`${state.year === range.key ? '🔘 ' : ''}${range.label}`, 'ty', range.key)))
                }
            }
            rows.push([btn('♻️ Сбросить', 'rs', undefined, 'danger'), btn('Готово ▶️', 'ok', undefined, 'success')])
            rows.push(back)
            break
        }
        case 'direction':
            rows.push([btn('✅ Уже вышли', 'd', 'released', 'success'), btn('🔜 Скоро', 'd', 'upcoming', 'success')])
            rows.push(back)
            break
        case 'period': {
            for (let i = 0; i < periods.length; i += 2) {
                rows.push(periods.slice(i, i + 2).map(period => {
                    const count = counts?.[period.key]
                    // Ничего не нашлось — кнопка неактивна, нажимать бесполезно.
                    if (count && count.count === 0 && !count.capped) return disabledBtn(`${period.label} (0)`)
                    return btn(`${period.label}${countLabel(count)}`, 'p', period.key, 'success')
                }))
            }
            rows.push(back)
            break
        }
    }

    return {
        text,
        keyboard: Markup.inlineKeyboard(rows).reply_markup,
        /** То же содержимое для rich-сообщения (с обложкой сверху) — без HTML. */
        /**
         * То же как rich-сообщение: обложка экрана сверху. Rich, а не фото с подписью: сообщение
         * мастера потом превращается в карточку подборки (тоже rich) той же правкой текста.
         */
        rich: (cover?: string) => ({
            blocks: [
                ...(cover ? [{type: 'photo', photo: {type: 'photo', media: cover}}] : []),
                ...richBlocks(lines)
            ]
        })
    }
}

/** Период для пути: у фильма с закрытым «Годом» период не выбирается — «за всё время» не пишем. */
export const periodCrumb = (state: WizardState, period?: string) => {
    if (!period) return undefined
    if (period === 'all' && state.section === 'movies' && yearRangeByKey(state.year)?.to) return undefined
    return (periodByKey(period)?.label ?? period).toLowerCase()
}

/** Заголовок карточки-результата: «Топ-10» или «Места 11–20». */
export const collectionHeading = (count: number, page = 0) =>
    page > 0 ? `Места ${page * 10 + 1}–${page * 10 + count}` : `Топ-${count}`

/** Строки под заголовком подборки: путь (со ссылками), отметки фильтра, пояснение. */
export const collectionLines = (state: WizardState, period: string, note: string, bot?: string): TextLine[] => [
    crumbLine(state, bot, periodCrumb(state, period)),
    ...filterLines(state, false),
    ...(note ? [quote(note)] : [])
]

/**
 * Номер страницы внизу: «Страница 1 из 3». Остаток кандидатов ещё не проверен на трейлер,
 * поэтому пока он есть, общее число страниц примерное («из ≈3»).
 */
export const collectionPageLabel = (page: number, restCount: number) => {
    const total = page + 1 + Math.ceil(restCount / 10)
    return `📄 Страница ${page + 1} из ${restCount ? '≈' : ''}${total}`
}

export const collectionNote = (count: number, match: 'and' | 'or' = 'and') => {
    const parts: string[] = []
    if (match === 'or') parts.push('Со всеми отметками нашлось мало — добавлены подходящие хотя бы под одну.')
    if (count < 10) parts.push(`Нашлось ${count} с трейлером.`)
    return parts.join(' ')
}

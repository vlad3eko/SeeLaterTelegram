import {Markup} from 'telegraf'
import {COLLECTION_ACTION} from '#server/bot/callbacks/routes'
import {
    genreByKey,
    genresForSection,
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
import {type ShelfKey, SHELVES} from '#server/global/engine/collections/shelves'
import {type Bundle, bundleByKey} from '#server/global/engine/collections/bundles'
import type {AvailableBundle} from '#server/global/engine/collections/buildCollection'
import {lifeLabel, MIN_DEATH_YEAR, type PersonLife, type PersonRole} from '#server/global/engine/collections/people/birthdays'

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

/**
 * Разделы верхнего меню и их полки: у мультфильмов и мультсериалов полка одна, у аниме и
 * дунхуа — две (экран «Фильмы или сериалы»).
 */
export const GROUPS: Array<{key: SectionGroup, label: string, ready: boolean, shelves: ShelfKey[]}> = [
    {key: 'movies', label: '🎬 Фильмы', ready: true, shelves: ['movie']},
    {key: 'series', label: '📺 Сериалы', ready: true, shelves: ['series']},
    {key: 'cartoons', label: '🧸 Мультфильмы', ready: true, shelves: ['animated_movie']},
    {key: 'cseries', label: '🎨 Мультсериалы', ready: true, shelves: ['animated_series']},
    {key: 'anime', label: '🌸 Аниме', ready: true, shelves: ['anime_movie', 'anime_series']},
    {key: 'donghua', label: '🐉 Дунхуа', ready: true, shelves: ['donghua_movie', 'donghua_series']},
    {key: 'people', label: '🎭 Актёры и режиссёры', ready: true, shelves: []}
]

/** Полка выбора: явная или по группе (старые сохранённые меню без полки). */
export const shelfKeyOf = (state: WizardState): ShelfKey =>
    state.shelf ?? (state.group === 'series' ? 'series' : 'movie')

/** Полка сериального типа: разделы «вышли полностью / новые серии / новые сезоны / скоро». */
export const isTvShelf = (state: WizardState) => SHELVES[shelfKeyOf(state)].mediaType === 'tv'

/** У группы два формата (аниме, дунхуа) — был экран «Фильмы или сериалы». */
export const hasFormat = (group?: SectionGroup) => (GROUPS.find(item => item.key === group)?.shelves.length ?? 0) > 1

export const CRITERION_LABEL = {filter: 'Фильтр', popular: 'Популярное', bundle: 'Связки'} as const
export const ROLE_LABEL: Record<PersonRole, string> = {actor: 'Актёры', director: 'Режиссёры'}
export const LIFE_LABEL: Record<PersonLife, string> = {alive: 'Живые', dead: 'Ушедшие'}

/** «19 ноября» — сегодня по Москве. */
export const todayLabel = (date = new Date()) =>
    new Intl.DateTimeFormat('ru-RU', {timeZone: 'Europe/Moscow', day: 'numeric', month: 'long'}).format(date)

/** Выбранная связка (только при criterion bundle). */
export const bundleOf = (state: WizardState): Bundle | undefined =>
    state.criterion === 'bundle' ? bundleByKey(state.bundle) : undefined
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
export type CrumbStep = 'home' | 'group' | 'format' | 'section' | 'criterion' | 'bundle' | 'direction'
export const CRUMB_STEPS: readonly CrumbStep[] = ['home', 'group', 'format', 'section', 'criterion', 'bundle', 'direction']

const crumbsOf = (state: WizardState, period?: string): Array<{label: string, step?: CrumbStep}> => {
    const crumbs: Array<{label: string, step?: CrumbStep}> = [{label: 'Меню', step: 'home'}]
    const group = GROUPS.find(item => item.key === state.group)
    if (group) crumbs.push({label: group.label.replace(/^\S+\s/, ''), step: 'group'})
    if (state.group === 'people' && state.personRole) crumbs.push({label: ROLE_LABEL[state.personRole].toLowerCase()})
    if (state.group === 'people' && state.personLife) crumbs.push({label: LIFE_LABEL[state.personLife].toLowerCase()})
    if (hasFormat(state.group) && state.shelf) crumbs.push({label: SHELVES[state.shelf].mediaType === 'tv' ? 'сериалы' : 'фильмы', step: 'format'})
    if (isTvShelf(state) && state.section) crumbs.push({label: SECTIONS[state.section].label.toLowerCase(), step: 'section'})
    const bundle = bundleOf(state)
    if (state.criterion) crumbs.push({label: CRITERION_LABEL[state.criterion], step: 'criterion'})
    if (bundle) crumbs.push({label: bundle.title, step: 'bundle'})
    if (state.direction && !isTvShelf(state) && state.criterion !== 'bundle') crumbs.push({label: DIRECTION_LABEL[state.direction].toLowerCase(), step: 'direction'})
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

/** «Драма» → «драма», но «НФ и фэнтези» остаётся с заглавными. */
const lowerFirst = (label: string) => /^\p{Lu}\p{Ll}/u.test(label) ? label[0]!.toLowerCase() + label.slice(1) : label

/** «драма, комедия» — каждое значение жирным. */
const boldList = (labels: string[]): TextPart[] =>
    labels.flatMap((label, index) => index ? [plain(', '), bold(label)] : [bold(label)])

/** Жанры, теги и год фильтра: на экране фильтра — все поля, дальше — только заполненные. */
const filterLines = (state: WizardState, full: boolean): TextLine[] => {
    if (state.criterion !== 'filter') return []
    const genres = state.genres.map(key => genreByKey(key)?.label).filter((label): label is string => Boolean(label)).map(lowerFirst)
    const tags = state.tags.map(key => tagByKey(key)?.label).filter((label): label is string => Boolean(label)).map(lowerFirst)
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
    format: 'Полнометражные фильмы или сериалы.',
    series: 'Уже вышли целиком, выходят новые серии или скоро стартуют.',
    criterion: 'Фильтр — сами отметите жанры, теги и год. Популярное — самое смотримое. Связки — готовые подборки под настроение и сюжет.',
    filter: '',
    bundles: 'Готовые подборки: сюжет, настроение, формат.',
    direction: 'Уже в кино и онлайн — или премьеры ещё впереди.',
    period: 'В скобках — сколько нашлось с трейлером.',
    result: '',
    title: '',
    people: 'Подборка ко дню рождения: 10 лучших фильмов актёра или режиссёра.',
    peopleLife: 'Живые или уже ушедшие.',
    peopleSearch: '',
    birthdays: 'Самые известные — сверху, фото — в «подробнее». Нажмите номер: соберу 10 лучших фильмов.'
}

const FILTER_HINT: TextLine = {quote: true, parts: [
    italic('Тайтл подходит и под жанры, и под теги. Сначала ищу со '), {text: 'всеми', bold: true, italic: true},
    italic(' отметками, если мало — с '), {text: 'любым', bold: true, italic: true}, italic(' из отмеченных жанров и тегов.')
]}

/** Строки → блоки rich-сообщения. */
export const richInline = (parts: TextPart[]): any[] => parts.map(part => {
    let node: any = part.text
    if (part.italic) node = {type: 'italic', text: node}
    if (part.bold) node = {type: 'bold', text: part.italic ? [node] : node}
    return part.url ? {type: 'url', text: [node], url: part.url} : node
})

export const richBlocks = (lines: TextLine[]): any[] => lines.map(line => {
    const text = richInline(line.parts)
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
    /** Экран связок: доступные на полке и в разделе (судимые — только с готовыми вердиктами). */
    bundles?: AvailableBundle[]
    /** Админ: на экране связок кнопка «⚙️ Сгенерировать связки» (запуск судьи в GitHub Actions). */
    admin?: boolean
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
    // Запасной текст (если rich-сообщение не принято): именинники строками.
    if (state.screen === 'birthdays' && !note) {
        ;(state.birthdays ?? []).forEach((person, index) =>
            lines.push({parts: [bold(`${index + 1}. ${person.name}`), plain(` · ${lifeLabel(person)}`)]}))
    }
    if (state.screen === 'peopleSearch' && !note && !counting) {
        lines.push({parts: [italic('Найду самых известных, у кого день рождения сегодня — '), bold(todayLabel()), italic('.')]})
    }
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
        case 'people':
            rows.push([btn('🎭 Актёры', 'pr', 'actor', 'success'), btn('🎬 Режиссёры', 'pr', 'director', 'success')])
            rows.push(back)
            break
        case 'peopleLife':
            rows.push([btn('🌟 Живые', 'pl', 'alive', 'success'), btn('🕯 Ушедшие', 'pl', 'dead', 'success')])
            rows.push(back)
            break
        case 'peopleSearch':
            rows.push([btn('🔎 Искать именинников', 'ps', undefined, 'success')])
            rows.push(back)
            break
        case 'birthdays': {
            // Как в подборках: список с номерами (фото — в «подробнее»), снизу кнопки-номера.
            const numbers = (state.birthdays ?? []).map((_, index) => btn(String(index + 1), 'pp', String(index), 'success'))
            for (let i = 0; i < numbers.length; i += 5) rows.push(numbers.slice(i, i + 5))
            // Ушедшие — только с MIN_DEATH_YEAR: пустой день объясняем, чтобы не казалось поломкой.
            if (!state.birthdays?.length) rows.push([disabledBtn(state.personLife === 'dead' ? `Сегодня никого (ушедшие с ${MIN_DEATH_YEAR} года)` : 'Сегодня никого не нашлось')])
            rows.push(back)
            break
        }
        case 'format':
            rows.push([btn('🎬 Фильмы', 'fm', 'movie', 'success'), btn('📺 Сериалы', 'fm', 'tv', 'success')])
            rows.push(back)
            break
        case 'series':
            rows.push([btn('✅ Вышли полностью', 'ss', 'series_completed', 'success')])
            rows.push([btn('🆕 Новые серии', 'ss', 'series_new', 'success'), btn('🎬 Новые сезоны', 'ss', 'series_seasons', 'success')])
            rows.push([btn('🔜 Скоро', 'ss', 'series_upcoming', 'success')])
            rows.push(back)
            break
        case 'criterion':
            rows.push([btn('🔎 Фильтр', 'c', 'filter', 'success'), btn('🔥 Популярное', 'c', 'popular', 'success')])
            if (options.bundles?.length) rows.push([btn('🧩 Связки', 'c', 'bundle', 'success')])
            rows.push(back)
            break
        case 'bundles':
            // Проработанные судьёй — зелёные, «сырые» (судья ещё не прогонял) — обычного цвета.
            for (const bundle of options.bundles ?? []) {
                rows.push([btn(`${bundle.emoji} ${bundle.title}`, 'bn', bundle.key, bundle.reviewed ? 'success' : undefined)])
            }
            if (!options.bundles?.length) rows.push([disabledBtn('Связок здесь пока нет')])
            rows.push(options.admin ? [...back, btn('⚙️ Сгенерировать связки', 'gb', undefined, 'primary')] : back)
            break
        case 'filter': {
            const section = state.section ? SECTIONS[state.section] : SECTIONS.movies
            rows.push([btn(`${state.openGenres ? '▼' : '▶'} Жанры${state.genres.length ? ` (выбрано ${state.genres.length})` : ''}`, 'f', 'g', 'primary')])
            if (state.openGenres) {
                const genres = genresForSection(section)
                const genreButtons = genres.map(genre =>
                    btn(`${state.genres.includes(genre.key) ? '✅ ' : ''}${genre.label}`, 'tg', genre.key))
                // У сериалов названия длинные («Боевик и приключения») — по два в ряд.
                const perRow = section.mediaType === 'tv' ? 2 : 3
                for (let i = 0; i < genreButtons.length; i += perRow) rows.push(genreButtons.slice(i, i + perRow))
            }
            rows.push([btn(`${state.openTags ? '▼' : '▶'} Теги${state.tags.length ? ` (выбрано ${state.tags.length})` : ''}`, 'f', 't', 'primary')])
            if (state.openTags) {
                const tags = tagsForSection(section, shelfKeyOf(state))
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
            blocks: state.screen === 'birthdays' && !note
                ? [...(cover ? [{type: 'photo', photo: {type: 'photo', media: cover}}] : []), ...richBlocks(lines.slice(0, 2)), ...birthdayBlocks(state)]
                : [
                    ...(cover ? [{type: 'photo', photo: {type: 'photo', media: cover}}] : []),
                    ...richBlocks(lines)
                ]
        })
    }
}

/**
 * Именинники как список подборки: «1. Джоди Фостер» (имя копируется по нажатию), в «подробнее» —
 * фото, роль и возраст или годы жизни.
 */
const birthdayBlocks = (state: WizardState): any[] => {
    const people = state.birthdays ?? []
    if (!people.length) return []
    const role = state.personRole === 'director' ? 'режиссёр' : 'актёр'
    return [{
        type: 'list',
        items: people.map((person, index) => ({
            value: index + 1,
            blocks: [
                {type: 'heading', size: 1, text: [`${index + 1}. `, {type: 'code', text: person.name}]},
                {
                    type: 'details',
                    summary: 'подробнее/скрыть',
                    blocks: [
                        ...(person.photo ? [{type: 'photo', photo: {type: 'photo', media: person.photo}, caption: {text: person.name}}] : []),
                        {type: 'paragraph', text: [`#${role} · 🎂 ${person.died ? lifeLabel(person) : `${lifeLabel(person)} (${person.born})`}`]}
                    ]
                }
            ]
        }))
    }]
}

/** Период для пути: у фильма с закрытым «Годом» период не выбирается — «за всё время» не пишем. */
export const periodCrumb = (state: WizardState, period?: string) => {
    if (!period) return undefined
    if (period === 'all' && state.section === 'movies' && yearRangeByKey(state.year)?.to) return undefined
    return (periodByKey(period)?.label ?? period).toLowerCase()
}

/** Заголовок карточки-результата: «Топ-10» или «Места 11–20»; у связки и «Похожего» — своё название. */
export const collectionHeading = (count: number, page = 0, title?: string) =>
    page > 0 ? `Места ${page * 10 + 1}–${page * 10 + count}` : title ?? `Топ-${count}`

/** Строки под заголовком подборки: путь (со ссылками), отметки фильтра, пояснение. */
export const collectionLines = (state: WizardState, period: string, note: string, bot?: string): TextLine[] => {
    const bundle = bundleOf(state)
    return [
        crumbLine(state, bot, periodCrumb(state, period)),
        ...(bundle ? [{parts: [italic(bundle.lead)]}] : []),
        ...filterLines(state, false),
        ...(note ? [quote(note)] : [])
    ]
}

/**
 * Страницы внизу подборки: «📄 Страница 1, 2, 3 из ≈10». Номера загруженных страниц — ссылки
 * t.me/<бот>?start=g_p<номер> (текущая — жирным, без ссылки); при большом числе страниц —
 * первая, соседние с текущей и последняя через «…». Остаток кандидатов ещё не проверен на
 * трейлер, поэтому пока он есть, общее число страниц примерное («из ≈10»).
 */
export const collectionPagesFooter = (page: number, loaded: number, restCount: number, bot?: string) => {
    const shown = loaded <= 7
        ? Array.from({length: loaded}, (_, index) => index)
        : [...new Set([0, page - 1, page, page + 1, loaded - 1])].filter(index => index >= 0 && index < loaded).sort((a, b) => a - b)
    const parts: TextPart[] = [plain('📄 Страница ')]
    shown.forEach((index, position) => {
        if (position) parts.push(plain(index - shown[position - 1]! > 1 ? ' … ' : ', '))
        parts.push(index === page
            ? bold(String(index + 1))
            : {text: String(index + 1), ...(bot ? {url: `https://t.me/${bot}?start=g_p${index + 1}`} : {})})
    })
    const total = loaded + Math.ceil(restCount / 10)
    parts.push(plain(` из ${restCount ? '≈' : ''}${total}`))
    return {type: 'footer', text: richInline(parts)}
}

export const collectionNote = (count: number, match: 'and' | 'or' = 'and', state?: WizardState) => {
    const parts: string[] = []
    if (match === 'or') {
        const manyGenres = (state?.genres.length ?? 0) > 1
        const manyTags = (state?.tags.length ?? 0) > 1
        const relaxed = manyGenres && manyTags ? 'хотя бы под один из отмеченных жанров и один из тегов'
            : manyTags ? 'хотя бы под один из отмеченных тегов'
                : 'хотя бы под один из отмеченных жанров'
        parts.push(`Со всеми отметками нашлось мало — добавлены подходящие ${relaxed}.`)
    }
    if (count < 10) parts.push(`Нашлось ${count} с трейлером.`)
    return parts.join(' ')
}

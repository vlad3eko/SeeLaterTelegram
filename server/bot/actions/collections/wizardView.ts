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

/** Краткое описание выбора для текста сообщения. */
export const describeSelection = (state: WizardState): string[] => {
    const lines: string[] = []
    if (state.section) {
        lines.push(state.group === 'series'
            ? `Раздел: Сериалы · ${SECTIONS[state.section].label}`
            : `Раздел: ${SECTIONS[state.section].label}`)
    } else if (state.group) {
        lines.push(`Раздел: ${GROUPS.find(g => g.key === state.group)?.label.replace(/^\S+\s/, '')}`)
    }
    if (state.criterion) lines.push(`Подборка: ${CRITERION_LABEL[state.criterion]}`)
    if (state.criterion === 'filter') {
        const genres = state.genres.map(key => genreByKey(key)?.label).filter(Boolean)
        const tags = state.tags.map(key => tagByKey(key)?.label).filter(Boolean)
        lines.push(`Жанры: ${genres.length ? genres.join(', ') : '—'}`)
        lines.push(`Теги: ${tags.length ? tags.join(', ') : '—'}`)
        if (!yearLocked(state)) lines.push(`Год: ${yearRangeByKey(state.year)?.label ?? '—'}`)
    }
    if (state.direction && state.group === 'movies') lines.push(`Выход: ${DIRECTION_LABEL[state.direction]}`)
    return lines
}

const PROMPT: Record<WizardState['screen'], string> = {
    home: 'Выберите режим.',
    root: 'Выберите раздел.',
    series: 'Какие сериалы?',
    criterion: 'Как собрать топ?',
    filter: 'Отметьте жанры, теги и год. Сначала ищу тайтлы, подходящие под все отмеченные жанры и теги, а если их мало — под любой из них.',
    direction: 'Уже вышли или скоро выйдут?',
    period: 'За какой период? В скобках — сколько нашлось с трейлером.',
    result: '',
    title: ''
}

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
}

export const renderWizard = (state: WizardState, options: RenderOptions = {}) => {
    const {note, counts, counting, periods = []} = options
    const header = '🎞 <b>Подборка</b>'
    const selection = describeSelection(state).map(line => escapeHtml(line))
    const prompt = counting ? '⏳ Подсчёт вариантов…' : PROMPT[state.screen]
    const text = [header, ...(selection.length ? ['', ...selection] : []), '', escapeHtml(prompt), ...(note ? ['', note] : [])].join('\n')

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

    return {text, keyboard: Markup.inlineKeyboard(rows).reply_markup}
}

/** Заголовок карточки-результата. */
export const collectionTitle = (state: WizardState, count: number, period: string, page = 0, match: 'and' | 'or' = 'and') => {
    const parts: string[] = []
    if (state.section) parts.push(SECTIONS[state.section].mediaType === 'tv'
        ? `Сериалы · ${SECTIONS[state.section].label.toLowerCase()}`
        : SECTIONS[state.section].label)
    if (state.criterion === 'popular') parts.push('популярное')
    else {
        const picked = [
            ...state.genres.map(key => genreByKey(key)?.label?.toLowerCase()),
            ...state.tags.map(key => tagByKey(key)?.label?.toLowerCase())
        ].filter(Boolean)
        if (picked.length) parts.push(picked.join(match === 'or' ? ' или ' : ' + '))
        const year = yearRangeByKey(state.year)
        if (year) parts.push(year.label)
    }
    // С закрытым диапазоном «Год» период не выбирается — «за всё время» не пишем.
    if (!(period === 'all' && yearRangeByKey(state.year)?.to)) {
        parts.push((periodByKey(period)?.label ?? period).toLowerCase())
    }
    const places = page > 0 ? `Места ${page * 10 + 1}–${page * 10 + count}` : `Топ-${count}`
    return `${places}: ${parts.filter(Boolean).join(' · ')}`
}

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
    if (match === 'or') parts.push('Тайтлов со всеми отмеченными жанрами и тегами мало — добавлены подходящие хотя бы под один.')
    if (count < 10) parts.push(`Нашлось ${count} с трейлером.`)
    return parts.join(' ')
}

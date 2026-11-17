import {Markup} from 'telegraf'
import {COLLECTION_ACTION} from '#server/bot/callbacks/routes'
import {
    GENRES,
    PERIODS,
    periodByKey,
    SECTIONS,
    TAG_GROUPS,
    tagByKey,
    tagsForSection,
    genreByKey
} from '#server/global/engine/collections/catalog'
import type {SectionGroup, WizardState} from '#server/bot/actions/collections/wizardState'

/** Текст и кнопки мастера подборки для текущего состояния. */

const btn = (text: string, action: string, arg?: string) =>
    Markup.button.callback(text, COLLECTION_ACTION.encode({action, ...(arg ? {arg} : {})}))

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

/** Краткое описание выбора: «Фильмы · Фильтр · Жанры: Ужасы · Теги: Призраки». */
export const describeSelection = (state: WizardState): string[] => {
    const lines: string[] = []
    if (state.section) lines.push(`Раздел: ${SECTIONS[state.section].label}`)
    else if (state.group) lines.push(`Раздел: ${GROUPS.find(g => g.key === state.group)?.label.replace(/^\S+\s/, '')}`)
    if (state.criterion) lines.push(`Подборка: ${CRITERION_LABEL[state.criterion]}`)
    if (state.criterion === 'filter') {
        const genres = state.genres.map(key => genreByKey(key)?.label).filter(Boolean)
        const tags = state.tags.map(key => tagByKey(key)?.label).filter(Boolean)
        lines.push(`Жанры: ${genres.length ? genres.join(', ') : '—'}`)
        lines.push(`Теги: ${tags.length ? tags.join(', ') : '—'}`)
    }
    if (state.direction) lines.push(`Выход: ${DIRECTION_LABEL[state.direction]}`)
    return lines
}

const PROMPT: Record<WizardState['screen'], string> = {
    root: 'Выберите раздел.',
    series: 'Какие сериалы?',
    criterion: 'Как собрать топ?',
    filter: 'Отметьте жанры и теги. Сначала ищу тайтлы, подходящие под все отмеченные, а если их мало — под любой из них.',
    direction: 'Уже вышли или скоро выйдут?',
    period: 'За какой период?'
}

export const renderWizard = (state: WizardState, note?: string) => {
    const header = '🎞 <b>Подборка</b>'
    const selection = describeSelection(state).map(line => escapeHtml(line))
    const text = [header, ...(selection.length ? ['', ...selection] : []), '', escapeHtml(PROMPT[state.screen]), ...(note ? ['', note] : [])].join('\n')

    const rows: any[][] = []
    const back = [btn('◀️ Назад', 'b')]

    switch (state.screen) {
        case 'root': {
            for (let i = 0; i < GROUPS.length; i += 2) {
                rows.push(GROUPS.slice(i, i + 2).map(group => btn(group.ready ? group.label : `${group.label} · скоро`, 's', group.key)))
            }
            rows.push([btn('✖️ Закрыть', 'x')])
            break
        }
        case 'series':
            rows.push([btn(SECTIONS.series_new.label, 'ss', 'series_new')])
            rows.push([btn(SECTIONS.series_airing.label, 'ss', 'series_airing')])
            rows.push(back)
            break
        case 'criterion':
            rows.push([btn('🔎 Фильтр', 'c', 'filter'), btn('🔥 Популярное', 'c', 'popular')])
            rows.push(back)
            break
        case 'filter': {
            const section = state.section ? SECTIONS[state.section] : SECTIONS.movies
            rows.push([btn(`${state.openGenres ? '▼' : '▶'} Жанры${state.genres.length ? ` (выбрано ${state.genres.length})` : ''}`, 'f', 'g')])
            if (state.openGenres) {
                const genreButtons = GENRES.map(genre =>
                    btn(`${state.genres.includes(genre.key) ? '✅ ' : ''}${genre.label}`, 'tg', genre.key))
                for (let i = 0; i < genreButtons.length; i += 3) rows.push(genreButtons.slice(i, i + 3))
            }
            rows.push([btn(`${state.openTags ? '▼' : '▶'} Теги${state.tags.length ? ` (выбрано ${state.tags.length})` : ''}`, 'f', 't')])
            if (state.openTags) {
                const tags = tagsForSection(section)
                for (const [group, groupLabel] of Object.entries(TAG_GROUPS)) {
                    const groupTags = tags.filter(tag => tag.group === group)
                    if (!groupTags.length) continue
                    rows.push([btn(`— ${groupLabel} —`, 'noop')])
                    const tagButtons = groupTags.map(tag =>
                        btn(`${state.tags.includes(tag.key) ? '✅ ' : ''}${tag.label}`, 'tt', tag.key))
                    for (let i = 0; i < tagButtons.length; i += 2) rows.push(tagButtons.slice(i, i + 2))
                }
            }
            rows.push([btn('♻️ Сбросить', 'rs'), btn('Готово ▶️', 'ok')])
            rows.push(back)
            break
        }
        case 'direction':
            rows.push([btn('✅ Уже вышли', 'd', 'released'), btn('🔜 Скоро', 'd', 'upcoming')])
            rows.push(back)
            break
        case 'period': {
            const periods = PERIODS.filter(period => period.direction === state.direction)
            for (let i = 0; i < periods.length; i += 2) {
                rows.push(periods.slice(i, i + 2).map(period => btn(period.label, 'p', period.key)))
            }
            rows.push(back)
            break
        }
    }

    return {text, keyboard: Markup.inlineKeyboard(rows).reply_markup}
}

/** Заголовок карточки-результата. */
export const collectionTitle = (state: WizardState, count: number, requested: string, used: string, page = 0, match: 'and' | 'or' = 'and') => {
    const section = state.section ? SECTIONS[state.section].label : ''
    const parts = [section]
    if (state.criterion === 'popular') parts.push('популярное')
    else {
        const picked = [
            ...state.genres.map(key => genreByKey(key)?.label?.toLowerCase()),
            ...state.tags.map(key => tagByKey(key)?.label?.toLowerCase())
        ].filter(Boolean)
        if (picked.length) parts.push(picked.join(match === 'or' ? ' или ' : ' + '))
    }
    parts.push((periodByKey(used)?.label ?? used).toLowerCase())
    const places = page > 0 ? `Места ${page * 10 + 1}–${page * 10 + count}` : `Топ-${count}`
    return `${places}: ${parts.filter(Boolean).join(' · ')}`
}

export const widenedNote = (requested: string, used: string, count: number, match: 'and' | 'or' = 'and') => {
    const parts: string[] = []
    if (match === 'or') {
        parts.push('Тайтлов со всеми отмеченными жанрами и тегами мало — показаны подходящие хотя бы под один.')
    }
    if (requested !== used) {
        parts.push(`За «${periodByKey(requested)?.label}» нашлось мало — показан период «${periodByKey(used)?.label}».`)
    }
    if (count < 10) parts.push(`Нашлось ${count} с трейлером.`)
    return parts.join(' ')
}

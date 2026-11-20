import {GoogleGenAI} from '@google/genai'
import type {MatchedMedia} from '#server/global/engine/youtube/matchTmdbMedia'

/**
 * Русский сюжет для автопубликации, когда в TMDB его ещё нет (решение владельца 20.11) — то же,
 * что владелец делал вручную: режим ИИ в Google «дай краткий сюжет без комментариев и ссылок»,
 * затем «Редактировать → 📝 Описание». Результат кладётся в session.overview, как ручное описание:
 * его берут и пост в канале, и подпись Reels.
 *
 * Gemini (GEMINI_API_KEY): перевод английского описания TMDB (оно приходит тем же запросом, что
 * и карточка). С YOUTUBE_OVERVIEW_SEARCH=on сначала поиск Google — на бесплатном тарифе он
 * отвечает 429, поэтому по умолчанию выключен и не тратит запрос. Год, режиссёр и актёры в
 * запросе — чтобы не перепутать с однофамильцем.
 */

const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash']
const TIMEOUT_MS = 60_000
const NONE = 'НЕТ'

export type OverviewFacts = {
    title: string
    originalTitle?: string
    year?: string
    kind: 'фильм' | 'сериал'
    director?: string
    cast: string[]
    englishOverview?: string
}

const describe = (facts: OverviewFacts) => {
    const details = [
        facts.originalTitle && facts.originalTitle !== facts.title ? `оригинальное название «${facts.originalTitle}»` : '',
        facts.year ?? '',
        facts.director ? `режиссёр ${facts.director}` : '',
        facts.cast.length ? `в ролях ${facts.cast.join(', ')}` : ''
    ].filter(Boolean).join(', ')
    return `${facts.kind === 'сериал' ? 'Сериал' : 'Фильм'} «${facts.title}»${details ? ` (${details})` : ''}`
}

const RULES = 'Только сам сюжет на русском языке, не больше 4 предложений, без спойлеров: без вступлений, ' +
    'комментариев, ссылок, сносок и оформления — чтобы текст можно было сразу вставить в пост. ' +
    'Ничего не выдумывай и не добавляй от себя. Имена — в принятой русской транскрипции.'

export const overviewPrompt = (facts: OverviewFacts, search: boolean) => search
    ? `${describe(facts)}. Найди в интернете и дай краткий сюжет. ${RULES}` +
        (facts.englishOverview ? ` Если в интернете ничего нет, переведи описание TMDB: «${facts.englishOverview}».` : '') +
        ` Если о сюжете ничего не известно, ответь ровно: ${NONE}`
    : `${describe(facts)}. Переведи на русский описание сюжета из TMDB близко к тексту, той же длины: ` +
        `«${facts.englishOverview}». ${RULES}`

/** Ответ модели → текст для поста, или undefined (ничего не известно, мусор). */
export const cleanOverview = (raw: string): string | undefined => {
    const text = raw
        .replace(/\[(?:\d+(?:[,\s]+\d+)*|cite[^\]]*)\]/gi, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[*_#`]+/g, '')
        .replace(/^\s*(?:краткий\s+)?сюжет\s*:\s*/i, '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1')
        // Сбой модели «на второй второй план».
        .replace(/(^|\s)(\p{L}+)(?:\s+\2)+(?=[\s.,;:!?]|$)/giu, '$1$2')
        .trim()
    if (!text || text.toUpperCase().startsWith(NONE)) return undefined
    if (text.length < 30 || !/[а-яё]{3}/i.test(text)) return undefined
    return text.length > 1000 ? `${text.slice(0, 1000).replace(/\s+\S*$/, '')}…` : text
}

/** Год, режиссёр, актёры и английское описание — из той же карточки TMDB, без запроса. */
export const overviewFacts = ({media, mediaType, tmdbTitle, extras}: MatchedMedia): OverviewFacts => ({
    title: tmdbTitle,
    originalTitle: media.original_title || media.original_name || undefined,
    year: String(media.release_date || media.first_air_date || '').slice(0, 4) || undefined,
    kind: mediaType === 'tv' ? 'сериал' : 'фильм',
    director: extras.director,
    cast: extras.cast.slice(0, 3).map(person => person.name).filter((name): name is string => Boolean(name)),
    englishOverview: extras.englishOverview
})

type Interaction = {id?: string, status?: string, output_text?: string}

/**
 * Русский сюжет или undefined (неизвестен ни поиску, ни TMDB). Исключение — Gemini не ответил
 * (лимит, сбой): очередь попробует позже.
 */
export const generateRussianOverview = async (
    facts: OverviewFacts,
    {apiKey = process.env.GEMINI_API_KEY?.trim(), search: searchEnabled = process.env.YOUTUBE_OVERVIEW_SEARCH?.trim() === 'on'} = {}
) => {
    let searchAvailable = searchEnabled
    // Ни поиска, ни описания TMDB — Gemini спрашивать не о чем.
    if (!searchAvailable && !facts.englishOverview) return undefined
    if (!apiKey) throw new Error('[YOUTUBE OVERVIEW] GEMINI_API_KEY is missing')
    const ai = new GoogleGenAI({apiKey})
    let lastError: unknown

    const ask = async (model: string, search: boolean) => {
        let id: string | undefined
        try {
            const interaction = await ai.interactions.create(
                {
                    model,
                    generation_config: {thinking_level: 'low'},
                    ...(search ? {tools: [{type: 'google_search'}]} : {}),
                    input: [{type: 'text', text: overviewPrompt(facts, search)}]
                } as never,
                {timeout_ms: TIMEOUT_MS, retries: {strategy: 'none'}} as never
            ) as Interaction
            id = interaction.id
            if (interaction.status !== 'completed') throw new Error(`status ${interaction.status}`)
            return String(interaction.output_text ?? '')
        } finally {
            if (id) await ai.interactions.delete(id).catch(() => undefined)
        }
    }

    for (const model of MODELS) {
        for (const search of [true, false]) {
            if (search && !searchAvailable) continue
            if (!search && !facts.englishOverview) continue
            try {
                const overview = cleanOverview(await ask(model, search))
                if (overview) return {overview, model, search}
                // Поиск ничего не нашёл — перевод описания TMDB тут же; без описания — неизвестно.
                if (!search || !facts.englishOverview) return undefined
            } catch (error) {
                lastError = error
                const message = error instanceof Error ? error.message : String(error)
                // Поиск Google не входит в тариф ключа — дальше только перевод.
                if (search && message.includes('429')) searchAvailable = false
                console.warn('[YOUTUBE OVERVIEW] Gemini failed', {model, search, message: message.slice(0, 160)})
            }
        }
    }
    if (lastError && (facts.englishOverview || searchAvailable)) throw lastError
    return undefined
}

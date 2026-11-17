import {Markup} from 'telegraf'
import {COLLECTION_ACTION} from '#server/bot/callbacks/routes'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {engineRichListCard} from '#server/global/engine/card/engineRichListCard'
import {
    buildCollectionFor,
    COLLECTION_SIZE,
    countCollection,
    type CollectionItem,
    type CollectionParams
} from '#server/global/engine/collections/buildCollection'
import {mapLimit} from '#server/global/engine/collections/tmdb'
import {findTrailers} from '#server/global/engine/collections/trailers'
import {genreByKey, PERIODS, periodByKey, SECTIONS, tagByKey, yearRangeByKey, type PeriodKey} from '#server/global/engine/collections/catalog'
import {addMessageSession} from '#server/bot/services/session/addMessageSession'
import {SessionMessageType} from '#server/bot/consts/types/SessionMessageTypes'
import type {ContentType} from '#server/global/engine/search/strategy/enums'
import {
    canPublishCollections,
    canUseCollections,
    emptyState,
    loadWizard,
    saveWizard,
    type WizardRow,
    type WizardState
} from '#server/bot/actions/collections/wizardState'
import {
    collectionNote,
    collectionTitle,
    GROUPS,
    renderWizard,
    type PeriodCounts
} from '#server/bot/actions/collections/wizardView'

/**
 * Мастер подборок /g (план — TASKS.md «ТЕКУЩАЯ ЗАДАЧА: подборки /g»):
 * Подборка → раздел → (сериалы: вышли полностью / новые серии и сезоны / скоро) →
 * Фильтр (жанры, теги, год) или Популярное → (фильмы: уже вышли / скоро) →
 * интервал с числом найденного → карточка «топ-10 с трейлерами».
 * Всё меню — одно сообщение, кнопки меняются на месте. Карточка — отдельное сообщение.
 */

const DENIED = 'Подборки пока недоступны.'

const btn = (text: string, action: string, arg?: string) =>
    Markup.button.callback(text, COLLECTION_ACTION.encode({action, ...(arg ? {arg} : {})}))

const safeAnswer = async (ctx: any, text?: string, alert = false) => {
    try {
        await ctx.answerCbQuery(text, alert ? {show_alert: true} : undefined)
    } catch {
        // Callback мог устареть.
    }
}

const isNotModified = (error: any) =>
    String(error?.response?.description ?? error?.message ?? '').includes('message is not modified')

/** Перерисовать сообщение мастера (по id из базы, чтобы работало и из карточки). */
const showWizard = async (ctx: any, row: WizardRow, note?: string, counts?: PeriodCounts) => {
    const {text, keyboard} = renderWizard(row.state, note, counts)
    const chatId = row.chatId ?? ctx.chat?.id
    if (chatId && row.messageId) {
        try {
            await ctx.telegram.editMessageText(chatId, row.messageId, undefined, text, {
                parse_mode: 'HTML',
                reply_markup: keyboard,
                link_preview_options: {is_disabled: true}
            })
            return
        } catch (error) {
            if (isNotModified(error)) return
            console.warn('[COLLECTIONS] Wizard message edit failed; sending a new one', (error as any)?.response?.description ?? error)
        }
    }
    const message = await ctx.reply(text, {parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: {is_disabled: true}})
    row.chatId = message.chat.id
    row.messageId = message.message_id
    await addMessageSession(ctx.from.id, SessionMessageType.Menu, {messageId: message.message_id})
}

/** Команда /g: новое меню подборки. */
export const startCollections = async (ctx: any) => {
    const telegramId = Number(ctx.from?.id)
    try {
        await ctx.deleteMessage()
    } catch {
        // Сообщение с командой могло уже исчезнуть.
    }
    if (!canUseCollections(telegramId)) {
        await ctx.reply(DENIED)
        return
    }

    const previous = await loadWizard(telegramId)
    if (previous.chatId && previous.messageId) {
        await ctx.telegram.deleteMessage(previous.chatId, previous.messageId).catch(() => undefined)
    }

    const row: WizardRow = {telegramId, state: emptyState()}
    await showWizard(ctx, row)
    await saveWizard(row)
}

/** Родительский экран для «Назад». */
const backFrom = (state: WizardState): WizardState => {
    switch (state.screen) {
        case 'series':
            return {...state, screen: 'root', group: undefined, section: undefined}
        case 'criterion':
            return state.group === 'series'
                ? {...state, screen: 'series', section: undefined, criterion: undefined}
                : {...emptyState(), screen: 'root'}
        case 'filter':
            return {...state, screen: 'criterion', criterion: undefined}
        case 'direction':
            return {...state, screen: state.criterion === 'filter' ? 'filter' : 'criterion', direction: undefined, ...(state.criterion === 'popular' ? {criterion: undefined} : {})}
        case 'period':
            // У сериалов направление задано подразделом — экрана «Уже вышли / Скоро» нет.
            if (state.group === 'series') {
                return state.criterion === 'filter'
                    ? {...state, screen: 'filter', direction: undefined}
                    : {...state, screen: 'criterion', criterion: undefined, direction: undefined}
            }
            return {...state, screen: 'direction', direction: undefined}
        default:
            return emptyState()
    }
}

/** На каком экране допустимо действие (кнопки «Назад», «Закрыть», карточки — везде). */
const ALLOWED_ON_SCREEN: Record<string, WizardState['screen'][]> = {
    s: ['root'],
    ss: ['series'],
    c: ['criterion'],
    f: ['filter'],
    tg: ['filter'],
    tt: ['filter'],
    ty: ['filter'],
    rs: ['filter'],
    ok: ['filter'],
    d: ['direction'],
    p: ['period']
}

const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter(item => item !== key) : [...list, key]

/** Следующий экран после выбора критерия: у сериалов направление известно из подраздела. */
const afterCriterion = (state: WizardState): WizardState => {
    const direction = state.section ? SECTIONS[state.section].direction : undefined
    return state.group === 'series' && direction
        ? {...state, screen: 'period', direction}
        : {...state, screen: 'direction'}
}

const paramsFor = (state: WizardState, period: PeriodKey): CollectionParams | null => {
    if (!state.section || !state.criterion) return null
    return {
        section: state.section,
        criterion: state.criterion,
        ...(state.criterion === 'filter'
            ? {genres: state.genres, tags: state.tags, ...(state.year ? {year: state.year} : {})}
            : {}),
        period
    }
}

/** Какую дату показывать у сериалов в карточке: у «Скоро» — первую серию, иначе последнюю. */
const tvDateFor = (section?: string): 'first' | 'last' | undefined => {
    if (section === 'series_upcoming') return 'first'
    return section && SECTIONS[section as keyof typeof SECTIONS]?.mediaType === 'tv' ? 'last' : undefined
}

const sameSelection = (a: WizardState, b: WizardState) =>
    JSON.stringify([a.screen, a.section, a.criterion, a.genres, a.tags, a.year, a.direction]) ===
    JSON.stringify([b.screen, b.section, b.criterion, b.genres, b.tags, b.year, b.direction])

/**
 * Числа на кнопках периодов: сколько тайтлов нашлось (без трейлеров и картинок).
 * Пока считаем, кнопки без чисел; если пользователь ушёл с экрана — не перерисовываем.
 */
const showPeriodCounts = async (ctx: any, row: WizardRow) => {
    const state = row.state
    const periods = PERIODS.filter(period => period.direction === state.direction)
    await showWizard(ctx, row, '⏳ Считаю, сколько нашлось за каждый период…')
    await saveWizard(row)

    const counts: PeriodCounts = {}
    await mapLimit(periods, 3, async period => {
        const params = paramsFor(state, period.key)
        if (!params) return
        try {
            counts[period.key] = await countCollection(params)
        } catch (error) {
            console.warn('[COLLECTIONS] Count failed', period.key, error instanceof Error ? error.message : error)
        }
    })

    const current = await loadWizard(row.telegramId)
    if (!sameSelection(current.state, state) || current.messageId !== row.messageId) return
    await showWizard(ctx, row, undefined, counts)
}

const toQuery = (item: CollectionItem) => ({
    id: item.id,
    type: item.mediaType,
    status: 'ready' as const,
    contentType: item.contentType as ContentType,
    keyTrailer: item.trailer.key
})

const cardFooter = (telegramId: number, collectionId: string, hasMore: boolean) => [
    ...(canPublishCollections(telegramId) ? [[btn('🎠 Собрать карусель', 'car', collectionId)]] : []),
    [
        ...(hasMore ? [btn('🔁 Ещё вариант', 'more', collectionId)] : []),
        btn('◀️ К подборке', 'cb', collectionId)
    ]
]

const itemRecord = (item: CollectionItem) => ({
    rank: item.rank,
    media_type: item.mediaType,
    content_type: item.contentType,
    id: item.id,
    title: item.title,
    year: item.year ?? null,
    score: item.score,
    trailer_key: item.trailer.key,
    trailer_language: item.trailer.language
})

/** Интервал выбран: собрать топ строго за этот период, сохранить подборку, прислать карточку. */
const buildAndSend = async (ctx: any, row: WizardRow, period: PeriodKey) => {
    const state = row.state
    const params = paramsFor(state, period)
    if (!params || !periodByKey(period)) {
        await showWizard(ctx, {...row, state: emptyState()})
        return
    }

    await showWizard(ctx, row, '⏳ Собираю топ: ищу тайтлы и проверяю трейлеры…')

    const result = await buildCollectionFor(params)
    if (!result.items.length) {
        await showWizard(ctx, row, '😕 За этот период ничего не нашлось с трейлером. Выберите другой период или вернитесь и измените фильтр.')
        return
    }

    const {data: saved, error} = await getSupabase()
        .from('collections')
        .insert({
            telegram_id: row.telegramId,
            params: {...params, match: result.match},
            items: result.items.map(itemRecord),
            candidates: result.rest,
            page: 0
        })
        .select('id')
        .single()
    if (error) throw new Error(`[COLLECTIONS] Save failed: ${error.message}`)

    const note = collectionNote(result.items.length, result.match)
    await engineRichListCard(ctx, result.items.map(toQuery), {
        title: collectionTitle(state, result.items.length, period, 0, result.match) + (note ? `\n${note}` : ''),
        footerRows: cardFooter(row.telegramId, saved.id, result.rest.length > 0),
        tvDate: tvDateFor(state.section)
    })

    await showWizard(ctx, row, '✅ Подборка готова — она ниже. Можно выбрать другой период или вернуться назад.')
}

/** «Ещё вариант»: следующие 10 с трейлером из оставшихся кандидатов той же подборки. */
const sendMore = async (ctx: any, collectionId: string) => {
    const supabase = getSupabase()
    const {data: collection, error} = await supabase
        .from('collections')
        .select('id,telegram_id,params,candidates,page')
        .eq('id', collectionId)
        .maybeSingle()
    if (error) throw new Error(`[COLLECTIONS] ${error.message}`)
    if (!collection || Number(collection.telegram_id) !== Number(ctx.from.id)) {
        await safeAnswer(ctx, 'Подборка не найдена — соберите новую через /g.', true)
        return
    }

    const section = SECTIONS[collection.params.section as keyof typeof SECTIONS]
    const rest = (collection.candidates ?? []) as Array<{id: number, score: number}>
    if (!section || !rest.length) {
        await safeAnswer(ctx, 'Больше вариантов нет.', true)
        return
    }

    await safeAnswer(ctx, 'Ищу следующие…')

    const picked: Array<{id: number, score: number, trailer: any}> = []
    let cursor = 0
    while (picked.length < COLLECTION_SIZE && cursor < rest.length) {
        const batch = rest.slice(cursor, cursor + 6)
        cursor += batch.length
        const trailers = await findTrailers(section.mediaType, batch.map(entry => entry.id))
        for (const entry of batch) {
            const trailer = trailers.get(entry.id)
            if (trailer && picked.length < COLLECTION_SIZE) picked.push({...entry, trailer})
        }
    }
    if (!picked.length) {
        await safeAnswer(ctx, 'Больше вариантов с трейлером нет.', true)
        return
    }

    const page = Number(collection.page ?? 0) + 1
    const remaining = rest.slice(cursor)
    const items = picked.map((entry, index) => ({
        rank: page * COLLECTION_SIZE + index + 1,
        media_type: section.mediaType,
        content_type: section.contentType,
        id: entry.id,
        score: entry.score,
        trailer_key: entry.trailer.key,
        trailer_language: entry.trailer.language
    }))

    await supabase
        .from('collections')
        .update({items, candidates: remaining, page, updated_at: new Date().toISOString()})
        .eq('id', collectionId)

    const state: WizardState = {
        ...emptyState(),
        group: section.mediaType === 'tv' ? 'series' : 'movies',
        section: collection.params.section,
        criterion: collection.params.criterion,
        genres: collection.params.genres ?? [],
        tags: collection.params.tags ?? [],
        ...(yearRangeByKey(collection.params.year) ? {year: collection.params.year} : {})
    }
    await engineRichListCard(ctx, picked.map(entry => ({
        id: entry.id,
        type: section.mediaType,
        status: 'ready' as const,
        contentType: section.contentType as ContentType,
        keyTrailer: entry.trailer.key
    })), {
        title: collectionTitle(state, picked.length, collection.params.period ?? collection.params.used_period, page, collection.params.match ?? 'and'),
        footerRows: cardFooter(Number(ctx.from.id), collectionId, remaining.length > 0),
        tvDate: tvDateFor(collection.params.section)
    })
}

/** Все кнопки мастера и карточки подборки. */
export const collectionAction = async (ctx: any) => {
    const telegramId = Number(ctx.from?.id)
    if (!canUseCollections(telegramId)) {
        await safeAnswer(ctx, DENIED, true)
        return
    }

    const {action, arg} = COLLECTION_ACTION.parse(ctx)

    try {
        if (action === 'noop') return safeAnswer(ctx)
        if (action === 'more') return sendMore(ctx, String(arg))
        if (action === 'car') return safeAnswer(ctx, 'Сборка карусели появится на следующем этапе.', true)

        const row = await loadWizard(telegramId)
        // Нажата кнопка в сообщении мастера — запоминаем его как текущее.
        if (action !== 'cb' && ctx.callbackQuery?.message) {
            row.chatId = ctx.callbackQuery.message.chat.id
            row.messageId = ctx.callbackQuery.message.message_id
        }
        let state = row.state

        // Кнопка не с текущего экрана (старое сообщение, двойное нажатие) — просто перерисовать мастер.
        const screenFor = ALLOWED_ON_SCREEN[action]
        if (screenFor && !screenFor.includes(state.screen)) {
            await safeAnswer(ctx, 'Меню обновлено — выберите заново.')
            await showWizard(ctx, row)
            await saveWizard(row)
            return
        }

        switch (action) {
            case 'x':
                await safeAnswer(ctx)
                await ctx.deleteMessage().catch(() => undefined)
                await saveWizard({telegramId, state: emptyState()})
                return

            case 'b':
                state = backFrom(state)
                break

            case 's': {
                const group = GROUPS.find(item => item.key === arg)
                if (!group) break
                if (!group.ready) return safeAnswer(ctx, 'Этот раздел появится на следующих этапах.', true)
                state = group.key === 'series'
                    ? {...emptyState(), screen: 'series', group: 'series'}
                    : {...emptyState(), screen: 'criterion', group: 'movies', section: 'movies'}
                break
            }

            case 'ss':
                if (arg === 'series_completed' || arg === 'series_new' || arg === 'series_upcoming') {
                    state = {...state, screen: 'criterion', section: arg}
                }
                break

            case 'c':
                if (arg === 'filter') state = {...state, screen: 'filter', criterion: 'filter'}
                if (arg === 'popular') state = afterCriterion({...state, criterion: 'popular', genres: [], tags: [], year: undefined})
                break

            case 'f':
                state = arg === 't' ? {...state, openTags: !state.openTags}
                    : arg === 'y' ? {...state, openYear: !state.openYear}
                        : {...state, openGenres: !state.openGenres}
                break

            case 'tg':
                if (arg && genreByKey(arg)) state = {...state, genres: toggle(state.genres, arg)}
                break

            case 'tt':
                if (arg && tagByKey(arg)) state = {...state, tags: toggle(state.tags, arg)}
                break

            case 'ty':
                if (arg && yearRangeByKey(arg)) state = {...state, year: state.year === arg ? undefined : arg as WizardState['year']}
                break

            case 'rs':
                state = {...state, genres: [], tags: [], year: undefined}
                break

            case 'ok':
                if (!state.genres.length && !state.tags.length && !state.year) {
                    return safeAnswer(ctx, 'Отметьте хотя бы один жанр, тег или год.', true)
                }
                state = afterCriterion(state)
                break

            case 'd':
                if (arg === 'released' || arg === 'upcoming') state = {...state, screen: 'period', direction: arg}
                break

            case 'p': {
                await safeAnswer(ctx, 'Собираю подборку…')
                row.state = state
                await saveWizard(row)
                await buildAndSend(ctx, row, arg as PeriodKey)
                return
            }

            case 'cb':
                await safeAnswer(ctx)
                await showWizard(ctx, row)
                await saveWizard(row)
                return

            default:
                return safeAnswer(ctx)
        }

        row.state = state
        await safeAnswer(ctx)
        if (state.screen === 'period') {
            await showPeriodCounts(ctx, row)
            return
        }
        await showWizard(ctx, row)
        await saveWizard(row)

    } catch (error) {
        console.error('[COLLECTIONS ACTION ERROR]', {action, arg, message: error instanceof Error ? error.message : error})
        await safeAnswer(ctx, 'Не получилось — попробуйте ещё раз.', true)
    }
}

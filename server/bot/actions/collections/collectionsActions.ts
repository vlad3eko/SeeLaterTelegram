import {COLLECTION_ACTION} from '#server/bot/callbacks/routes'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {constructRichListCard} from '#server/global/engine/card/construct/constructRichListCard'
import {tryGenerateCard} from '#server/global/engine/card/construct/tryGenerateCard'
import {engineRichCard} from '#server/global/engine/card/engineRichCard'
import {
    buildCollectionFor,
    COLLECTION_SIZE,
    collectionWindow,
    countCollection,
    type CollectionItem,
    type CollectionParams
} from '#server/global/engine/collections/buildCollection'
import {mapLimit} from '#server/global/engine/collections/tmdb'
import {findTrailers} from '#server/global/engine/collections/trailers'
import {
    genreByKey,
    isPastYearRange,
    PERIODS,
    periodByKey,
    SECTIONS,
    tagByKey,
    yearRangeByKey,
    type PeriodKey
} from '#server/global/engine/collections/catalog'
import {sendRichMessage} from '#server/global/engine/card/transport/sendRichMessage'
import {coverFor, forgetCovers, type CoverScreen} from '#server/bot/actions/collections/wizardCovers'
import {addMessageSession} from '#server/bot/services/session/addMessageSession'
import {SessionMessageType} from '#server/bot/consts/types/SessionMessageTypes'
import type {ContentType} from '#server/global/engine/search/strategy/enums'
import {isAdmin} from '#server/bot/consts/admins'
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
    btn,
    collectionNote,
    collectionPageLabel,
    collectionTitle,
    GROUPS,
    renderWizard,
    type PeriodCounts,
    type RenderOptions
} from '#server/bot/actions/collections/wizardView'

/**
 * /g (план — TASKS.md «ТЕКУЩАЯ ЗАДАЧА: подборки /g»): режимы → «Подборка» → раздел →
 * (сериалы: вышли полностью / новые серии и сезоны / скоро) → Фильтр (жанры, теги, год) или
 * Популярное → (фильмы: уже вышли / скоро) → интервал с числом найденного → подборка.
 * Всё — одно сообщение: меню превращается в подборку (топ-10 с трейлерами), из подборки
 * открывается тайтл, «Назад в меню» возвращает меню на место.
 */

const DENIED = 'Подборки пока недоступны.'

const safeAnswer = async (ctx: any, text?: string, alert = false) => {
    try {
        await ctx.answerCbQuery(text, alert ? {show_alert: true} : undefined)
    } catch {
        // Callback мог устареть.
    }
}

const isNotModified = (error: any) =>
    String(error?.response?.description ?? error?.message ?? '').includes('message is not modified')

type CollectionRecord = {
    rank: number
    media_type: 'movie' | 'tv'
    content_type: string
    id: number
    title?: string
    year?: number | null
    score: number
    trailer_key: string
    trailer_language: string
}

type CollectionRow = {
    id: string
    telegram_id: number
    params: CollectionParams & {match?: 'and' | 'or'}
    items: CollectionRecord[]
    candidates: Array<{id: number, score: number}>
    page: number
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

/** Периоды направления, у которых есть пересечение с блоком «Год» (иначе кнопка бессмысленна). */
const availablePeriods = (state: WizardState) =>
    PERIODS.filter(period => {
        if (period.direction !== state.direction) return false
        const params = paramsFor(state, period.key)
        return Boolean(params && collectionWindow(params))
    })

/** Обложка для экрана: пока собирается подборка — «Собираю топ…». */
const coverScreenFor = (row: WizardRow, options: RenderOptions): CoverScreen | undefined => {
    const screen = row.state.screen
    if (screen === 'result' || screen === 'title') return undefined
    return options.building ? 'loading' : screen
}

/**
 * Перерисовать сообщение мастера (по id из базы). Сначала rich-сообщение с обложкой экрана;
 * если Telegram его не принял — прежний текст с HTML, чтобы меню работало в любом случае.
 */
const showWizard = async (ctx: any, row: WizardRow, options: RenderOptions = {}) => {
    const {text, keyboard, rich} = renderWizard(row.state, {
        ...options,
        periods: options.periods ?? availablePeriods(row.state)
    })
    const coverScreen = coverScreenFor(row, options)
    const cover = coverScreen ? await coverFor(coverScreen, row.messageId) : undefined
    const chatId = row.chatId ?? ctx.chat?.id

    if (chatId && row.messageId) {
        try {
            await ctx.telegram.callApi('editMessageText', {
                chat_id: chatId,
                message_id: row.messageId,
                rich_message: rich(cover),
                reply_markup: keyboard
            })
            return
        } catch (error) {
            if (isNotModified(error)) return
            console.warn('[COLLECTIONS] Wizard rich edit failed; plain text', (error as any)?.response?.description ?? error)
            if (cover) forgetCovers()
        }
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

    let message: any
    try {
        message = await sendRichMessage(ctx, rich(cover), keyboard)
    } catch (error) {
        console.warn('[COLLECTIONS] Wizard rich send failed; plain text', (error as any)?.response?.description ?? error)
        if (cover) forgetCovers()
        message = await ctx.reply(text, {parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: {is_disabled: true}})
    }
    row.chatId = message.chat.id
    row.messageId = message.message_id
    await addMessageSession(ctx.from.id, SessionMessageType.Menu, {messageId: message.message_id})
}

/** Команда /g: меню режимов. */
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

/** Следующий экран после фильтра или «Популярного». */
const afterCriterion = (state: WizardState): WizardState => {
    const direction = state.section ? SECTIONS[state.section].direction : undefined
    if (state.group === 'series' && direction) return {...state, screen: 'period', direction}
    // Фильм из диапазона «1985–2000» или «2000–2015» уже вышел: «Скоро» не спрашиваем.
    if (isPastYearRange(state.year)) return {...state, screen: 'period', direction: 'released'}
    return {...state, screen: 'direction'}
}

/** Родительский экран для «Назад». */
const backFrom = (state: WizardState): WizardState => {
    switch (state.screen) {
        case 'root':
            return emptyState()
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
        case 'period': {
            // Экрана «Уже вышли / Скоро» не было (сериалы, фильмы с прошедшим «Годом») — назад к фильтру.
            const skippedDirection = state.group === 'series' || isPastYearRange(state.year)
            if (!skippedDirection) return {...state, screen: 'direction', direction: undefined}
            return state.criterion === 'filter'
                ? {...state, screen: 'filter', direction: undefined}
                : {...state, screen: 'criterion', criterion: undefined, direction: undefined}
        }
        default:
            return emptyState()
    }
}

/** На каком экране допустимо действие. */
const ALLOWED_ON_SCREEN: Record<string, WizardState['screen'][]> = {
    m: ['home'],
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
    p: ['period'],
    more: ['result'],
    t: ['result'],
    car: ['result'],
    cb: ['result'],
    l: ['title']
}

const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter(item => item !== key) : [...list, key]

/** Какую дату показывать у сериалов в карточке: у «Скоро» — первую серию, иначе последнюю. */
const tvDateFor = (section?: string): 'first' | 'last' | undefined => {
    if (section === 'series_upcoming') return 'first'
    return section && SECTIONS[section as keyof typeof SECTIONS]?.mediaType === 'tv' ? 'last' : undefined
}

const sameSelection = (a: WizardState, b: WizardState) =>
    JSON.stringify([a.screen, a.section, a.criterion, a.genres, a.tags, a.year, a.direction]) ===
    JSON.stringify([b.screen, b.section, b.criterion, b.genres, b.tags, b.year, b.direction])

/**
 * Экран периода с числами на кнопках (сколько нашлось с трейлером). Пока считаем —
 * «Подсчёт вариантов»; если период один (фильм с «Годом» 1985–2000) — сразу подборка.
 */
const enterPeriod = async (ctx: any, row: WizardRow) => {
    const state = row.state
    const periods = availablePeriods(state)
    if (periods.length === 1) {
        // Сохранить до сборки: buildAndSend сверяет выбор с базой, чтобы не показать устаревшее.
        await saveWizard(row)
        await buildAndSend(ctx, row, periods[0]!.key)
        await saveWizard(row)
        return
    }

    await showWizard(ctx, row, {counting: true, periods})
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
    await showWizard(ctx, row, {counts, periods})
}

const recordOf = (item: CollectionItem): CollectionRecord => ({
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

const queryOf = (record: CollectionRecord) => ({
    id: record.id,
    type: record.media_type,
    status: 'ready' as const,
    contentType: record.content_type as ContentType,
    keyTrailer: record.trailer_key
})

const loadCollection = async (collectionId: string | undefined, telegramId: number): Promise<CollectionRow | null> => {
    if (!collectionId) return null
    const {data, error} = await getSupabase()
        .from('collections')
        .select('id,telegram_id,params,items,candidates,page')
        .eq('id', collectionId)
        .maybeSingle()
    if (error) throw new Error(`[COLLECTIONS] ${error.message}`)
    if (!data || Number(data.telegram_id) !== telegramId) return null
    return data as CollectionRow
}

const richTarget = (ctx: any, row: WizardRow) => ({
    ctx,
    chatId: row.chatId ?? ctx.chat?.id,
    messageId: row.messageId,
    isAdmin: isAdmin(row.telegramId)
})

/** Сообщение мастера → карточка подборки (текущая страница). */
const showCollection = async (ctx: any, row: WizardRow, collection: CollectionRow) => {
    const state = row.state
    const page = Number(collection.page ?? 0)
    const count = collection.items.length
    const note = page === 0 ? collectionNote(count, collection.params.match ?? 'and') : ''
    const hasMore = (collection.candidates ?? []).length > 0

    const footerRows = [
        ...(canPublishCollections(row.telegramId) ? [[btn('🎠 Собрать карусель', 'car')]] : []),
        [
            btn('◀️ Назад в меню', 'cb', undefined, 'danger'),
            ...(hasMore ? [btn('🔁 Ещё вариант', 'more', undefined, 'success')] : [])
        ]
    ]

    const target = richTarget(ctx, row)
    const {caption, keyboard} = await constructRichListCard(target, collection.items.map(queryOf), {
        title: collectionTitle(state, count, collection.params.period, page, collection.params.match ?? 'and') + (note ? `\n${note}` : ''),
        footer: collectionPageLabel(page, (collection.candidates ?? []).length),
        footerRows,
        tvDate: tvDateFor(collection.params.section),
        itemButton: (text, index) => btn(text, 't', String(index)),
        startNumber: page * COLLECTION_SIZE + 1
    })
    await tryGenerateCard(target, caption, keyboard)
}

/** Интервал выбран: собрать топ строго за этот период, сохранить, превратить меню в подборку. */
const buildAndSend = async (ctx: any, row: WizardRow, period: PeriodKey) => {
    const state = row.state
    const params = paramsFor(state, period)
    if (!params || !periodByKey(period)) {
        row.state = emptyState()
        await showWizard(ctx, row)
        return
    }

    await showWizard(ctx, row, {note: '⏳ Собираю топ: ищу тайтлы и проверяю трейлеры…', building: true})

    const result = await buildCollectionFor(params)

    // Пока собирали (это до 10–20 секунд), меню могли увести назад или открыть /g заново —
    // тогда результат не показываем, чтобы не затереть текущий экран.
    const current = await loadWizard(row.telegramId)
    if (!sameSelection(current.state, state) || current.messageId !== row.messageId) return

    if (!result.items.length) {
        await showWizard(ctx, row, {note: '😕 За этот период ничего не нашлось с трейлером. Выберите другой период или вернитесь и измените фильтр.'})
        return
    }

    const {data: saved, error} = await getSupabase()
        .from('collections')
        .insert({
            telegram_id: row.telegramId,
            params: {...params, match: result.match},
            items: result.items.map(recordOf),
            candidates: result.rest,
            page: 0
        })
        .select('id,telegram_id,params,items,candidates,page')
        .single()
    if (error) throw new Error(`[COLLECTIONS] Save failed: ${error.message}`)

    row.state = {...state, screen: 'result', collectionId: saved.id}
    await showCollection(ctx, row, saved as CollectionRow)
    await saveWizard(row)
}

/** «Ещё вариант»: следующие 10 с трейлером из оставшихся кандидатов — в том же сообщении. */
const showMore = async (ctx: any, row: WizardRow) => {
    const collection = await loadCollection(row.state.collectionId, row.telegramId)
    const section = collection ? SECTIONS[collection.params.section] : undefined
    const rest = collection?.candidates ?? []
    if (!collection || !section || !rest.length) {
        await safeAnswer(ctx, 'Больше вариантов нет.', true)
        return
    }

    await safeAnswer(ctx, 'Ищу следующие…')

    const picked: Array<{id: number, score: number, trailer: any}> = []
    // consumed — сколько кандидатов просмотрено; остальные (включая хвост последней пачки,
    // если десятка набралась посередине) остаются на следующую страницу.
    let consumed = 0
    while (picked.length < COLLECTION_SIZE && consumed < rest.length) {
        const batch = rest.slice(consumed, consumed + 6)
        const trailers = await findTrailers(section.mediaType, batch.map(entry => entry.id))
        for (const entry of batch) {
            if (picked.length >= COLLECTION_SIZE) break
            consumed++
            const trailer = trailers.get(entry.id)
            if (trailer) picked.push({...entry, trailer})
        }
    }
    if (!picked.length) {
        await getSupabase().from('collections').update({candidates: []}).eq('id', collection.id)
        await safeAnswer(ctx, 'Больше вариантов с трейлером нет.', true)
        return
    }

    const page = Number(collection.page ?? 0) + 1
    const updated: CollectionRow = {
        ...collection,
        page,
        candidates: rest.slice(consumed),
        items: picked.map((entry, index) => ({
            rank: page * COLLECTION_SIZE + index + 1,
            media_type: section.mediaType,
            content_type: section.contentType,
            id: entry.id,
            score: entry.score,
            trailer_key: entry.trailer.key,
            trailer_language: entry.trailer.language
        }))
    }

    // Защита от двойного нажатия: страницу сохраняет только тот, кто начинал с прежней.
    const {data: saved, error} = await getSupabase()
        .from('collections')
        .update({items: updated.items, candidates: updated.candidates, page, updated_at: new Date().toISOString()})
        .eq('id', collection.id)
        .eq('page', Number(collection.page ?? 0))
        .select('id')
    if (error) throw new Error(`[COLLECTIONS] Page save failed: ${error.message}`)
    if (!saved?.length) return

    await showCollection(ctx, row, updated)
}

/** Все кнопки /g. */
export const collectionAction = async (ctx: any) => {
    const telegramId = Number(ctx.from?.id)
    if (!canUseCollections(telegramId)) {
        await safeAnswer(ctx, DENIED, true)
        return
    }

    const {action, arg} = COLLECTION_ACTION.parse(ctx)

    try {
        if (action === 'noop') return safeAnswer(ctx)

        const row = await loadWizard(telegramId)
        const pressed = ctx.callbackQuery?.message
        // Кнопка из старого сообщения (до последнего /g) — не трогаем текущее меню.
        if (pressed && row.messageId && pressed.message_id !== row.messageId) {
            return safeAnswer(ctx, 'Это старое меню — откройте /g заново.', true)
        }
        if (pressed) {
            row.chatId = pressed.chat.id
            row.messageId = pressed.message_id
        }
        let state = row.state

        // Кнопка не с текущего экрана (двойное нажатие) — просто перерисовать.
        const screenFor = ALLOWED_ON_SCREEN[action]
        if (screenFor && !screenFor.includes(state.screen)) {
            await safeAnswer(ctx, 'Меню обновлено — выберите заново.')
            if (state.screen !== 'result' && state.screen !== 'title') await showWizard(ctx, row)
            return
        }

        switch (action) {
            case 'x':
                await safeAnswer(ctx)
                await ctx.deleteMessage().catch(() => undefined)
                await saveWizard({telegramId, state: emptyState()})
                return

            case 'm':
                state = {...emptyState(), screen: 'root'}
                break

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
                    state = {...state, screen: 'criterion', section: arg, ...(arg === 'series_upcoming' ? {year: undefined} : {})}
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
                if (arg && yearRangeByKey(arg) && state.section !== 'series_upcoming') {
                    state = {...state, year: state.year === arg ? undefined : arg as WizardState['year']}
                }
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
                if (!availablePeriods(state).some(period => period.key === arg)) return safeAnswer(ctx)
                await safeAnswer(ctx, 'Собираю подборку…')
                await saveWizard(row)
                await buildAndSend(ctx, row, arg as PeriodKey)
                return
            }

            case 'more':
                await showMore(ctx, row)
                return

            case 'car':
                return safeAnswer(ctx, 'Сборка карусели появится на следующем этапе.', true)

            case 't': {
                const collection = await loadCollection(state.collectionId, telegramId)
                const record = collection?.items[Number(arg)]
                if (!record) return safeAnswer(ctx, 'Тайтл не найден.', true)
                await safeAnswer(ctx)
                await engineRichCard(richTarget(ctx, row), queryOf(record), {
                    footerRows: [[btn('◀️ К подборке', 'l', undefined, 'danger')]]
                })
                row.state = {...state, screen: 'title'}
                await saveWizard(row)
                return
            }

            case 'l': {
                const collection = await loadCollection(state.collectionId, telegramId)
                if (!collection) return safeAnswer(ctx, 'Подборка не найдена — соберите новую.', true)
                await safeAnswer(ctx)
                row.state = {...state, screen: 'result'}
                await showCollection(ctx, row, collection)
                await saveWizard(row)
                return
            }

            case 'cb': {
                // «Назад в меню»: подборка снова становится меню на экране периода.
                const toPeriod: WizardState = {...state, screen: 'period', collectionId: undefined}
                state = availablePeriods(toPeriod).length > 1 ? toPeriod : backFrom(toPeriod)
                break
            }

            default:
                return safeAnswer(ctx)
        }

        row.state = state
        await safeAnswer(ctx)
        if (state.screen === 'period') {
            await enterPeriod(ctx, row)
            return
        }
        await showWizard(ctx, row)
        await saveWizard(row)

    } catch (error) {
        console.error('[COLLECTIONS ACTION ERROR]', {action, arg, message: error instanceof Error ? error.message : error})
        await safeAnswer(ctx, 'Не получилось — попробуйте ещё раз.', true)
    }
}

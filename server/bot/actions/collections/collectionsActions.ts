import {COLLECTION_ACTION} from '#server/bot/callbacks/routes'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {constructRichListCard} from '#server/global/engine/card/construct/constructRichListCard'
import type {TvDate} from '#server/global/engine/card/variant/createRichListCaption'
import {tryGenerateCard} from '#server/global/engine/card/construct/tryGenerateCard'
import {engineRichCard} from '#server/global/engine/card/engineRichCard'
import {
    availableBundles,
    buildCollectionFor,
    COLLECTION_SIZE,
    collectionWindow,
    countCollection,
    shelfForParams,
    type CollectionItem,
    type CollectionParams
} from '#server/global/engine/collections/buildCollection'
import {buildSimilar} from '#server/global/engine/collections/similar'
import {bundleByKey, bundleFits} from '#server/global/engine/collections/bundles'
import {SHELVES, type ShelfKey} from '#server/global/engine/collections/shelves'
import {mapLimit} from '#server/global/engine/collections/tmdb'
import {findTrailers} from '#server/global/engine/collections/trailers'
import {
    genresForSection,
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
    collectionHeading,
    collectionLines,
    collectionNote,
    collectionPagesFooter,
    CRUMB_STEPS,
    GROUPS,
    hasFormat,
    isTvShelf,
    shelfKeyOf,
    periodCrumb,
    renderWizard,
    richBlocks,
    type CrumbStep,
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

/** Username бота — для ссылок пути «Меню › Фильмы › …». */
const botName = (ctx: any): string | undefined => ctx.botInfo?.username ?? ctx.me

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

/** «Похожее»: подборка от тайтла; parent_id — подборка, из которой его открыли (кнопка «К подборке»). */
type SimilarParams = {similar?: {media_type: 'movie' | 'tv', id: number, title: string}, parent_id?: string}

type CollectionRow = {
    id: string
    telegram_id: number
    params: CollectionParams & {match?: 'and' | 'or'} & SimilarParams
    items: CollectionRecord[]
    candidates: Array<{id: number, score: number}>
    page: number
}

const paramsFor = (state: WizardState, period: PeriodKey): CollectionParams | null => {
    if (!state.section || !state.criterion) return null
    if (state.criterion === 'bundle' && !state.bundle) return null
    return {
        section: state.section,
        criterion: state.criterion,
        ...(state.criterion === 'filter'
            ? {genres: state.genres, tags: state.tags, ...(state.year ? {year: state.year} : {})}
            : {}),
        ...(state.criterion === 'bundle' ? {bundle: state.bundle} : {}),
        shelf: shelfKeyOf(state),
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
    const needsBundles = (row.state.screen === 'criterion' || row.state.screen === 'bundles') && row.state.section && !options.bundles
    const {text, keyboard, rich} = renderWizard(row.state, {
        bot: botName(ctx),
        ...options,
        ...(needsBundles ? {bundles: await availableBundles(shelfKeyOf(row.state), row.state.section!)} : {}),
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

/**
 * Ссылка пути (t.me/<бот>?start=g_<шаг>): удалить /start и прежнее сообщение мастера,
 * прислать меню заново — на экране сразу после выбранного шага, с сохранённым выбором до него.
 */
export const jumpCollections = async (ctx: any, step: string) => {
    const telegramId = Number(ctx.from?.id)
    await ctx.deleteMessage().catch(() => undefined)
    if (!canUseCollections(telegramId)) {
        await ctx.reply(DENIED)
        return
    }
    try {
        // Номер страницы подборки (g_p3): та же карточка, другая страница — правкой сообщения.
        const pageMatch = /^p(\d{1,3})$/.exec(step)
        if (pageMatch) {
            const row = await loadWizard(telegramId)
            const collection = row.messageId && (row.state.screen === 'result' || row.state.screen === 'title')
                ? await loadCollection(row.state.collectionId, telegramId)
                : null
            const page = Number(pageMatch[1]) - 1
            // Старые записи хранили только текущую страницу — прошлых в них нет.
            if (!collection || page < 0 || page >= loadedPages(collection) || !pageItems(collection, page).length) return
            const shown = page === Number(collection.page ?? 0) ? collection : await switchPage(collection, page)
            if (!shown) return
            row.state = {...row.state, screen: 'result'}
            await showCollection(ctx, row, shown)
            await saveWizard(row)
            return
        }

        const previous = await loadWizard(telegramId)
        if (previous.chatId && previous.messageId) {
            await ctx.telegram.deleteMessage(previous.chatId, previous.messageId).catch(() => undefined)
        }
        const state = previous.state
        const target = (CRUMB_STEPS as readonly string[]).includes(step) ? jumpState(state, step as CrumbStep) : null
        const row: WizardRow = {
            telegramId,
            state: target ?? (state.screen === 'result' || state.screen === 'title' ? emptyState() : state)
        }
        await showWizard(ctx, row)
        await saveWizard(row)
        if (row.state.screen === 'period') await enterPeriod(ctx, row)
    } catch (error) {
        console.error('[COLLECTIONS JUMP ERROR]', {step, message: error instanceof Error ? error.message : error})
    }
}

/** Состояние после шага пути; null — такого шага в текущем выборе нет. */
const jumpState = (state: WizardState, step: CrumbStep): WizardState | null => {
    const base = emptyState()
    switch (step) {
        case 'home':
            return base
        case 'group':
            return state.group ? groupState(state.group) : null
        case 'format':
            return state.group && state.shelf ? shelfState(state.group, state.shelf) : null
        case 'section':
            return state.group && state.section ? {...base, screen: 'criterion', group: state.group, shelf: state.shelf, section: state.section} : null
        case 'bundle':
            return state.group && state.section && state.criterion === 'bundle'
                ? {...base, screen: 'bundles', group: state.group, shelf: state.shelf, section: state.section, criterion: 'bundle'}
                : null
        case 'criterion': {
            if (!state.group || !state.section || !state.criterion) return null
            if (state.criterion === 'bundle') {
                return {...base, screen: 'bundles', group: state.group, shelf: state.shelf, section: state.section, criterion: 'bundle'}
            }
            const kept: WizardState = {
                ...base, group: state.group, shelf: state.shelf, section: state.section, criterion: state.criterion,
                genres: state.genres, tags: state.tags, year: state.year,
                openGenres: state.openGenres, openTags: state.openTags, openYear: state.openYear
            }
            return state.criterion === 'filter'
                ? {...kept, screen: 'filter'}
                : afterCriterion({...kept, genres: [], tags: [], year: undefined})
        }
        case 'direction':
            return state.direction && state.criterion ? {...state, screen: 'period', collectionId: undefined} : null
    }
}

/** Экран после выбора раздела меню: аниме и дунхуа — «Фильмы или сериалы», иначе полка сразу. */
const groupState = (group: WizardState['group']): WizardState | null => {
    const entry = GROUPS.find(item => item.key === group)
    if (!entry?.ready || !entry.shelves.length) return null
    if (entry.shelves.length > 1) return {...emptyState(), screen: 'format', group: entry.key}
    return shelfState(entry.key, entry.shelves[0]!)
}

/** Полка выбрана: у сериальных — выбор раздела, у фильмов — сразу отбор. */
const shelfState = (group: NonNullable<WizardState['group']>, shelf: ShelfKey): WizardState =>
    SHELVES[shelf].mediaType === 'tv'
        ? {...emptyState(), screen: 'series', group, shelf}
        : {...emptyState(), screen: 'criterion', group, shelf, section: 'movies'}

/** Следующий экран после фильтра, «Популярного» или связки. */
const afterCriterion = (state: WizardState): WizardState => {
    const direction = state.section ? SECTIONS[state.section].direction : undefined
    if (isTvShelf(state) && direction) return {...state, screen: 'period', direction}
    // Связки — только о вышедшем.
    if (state.criterion === 'bundle') return {...state, screen: 'period', direction: 'released'}
    // Фильм из диапазона «1985–2000» или «2000–2015» уже вышел: «Скоро» не спрашиваем.
    if (isPastYearRange(state.year)) return {...state, screen: 'period', direction: 'released'}
    return {...state, screen: 'direction'}
}

/** Родительский экран для «Назад». */
const backFrom = (state: WizardState): WizardState => {
    switch (state.screen) {
        case 'root':
            return emptyState()
        case 'format':
            return {...emptyState(), screen: 'root'}
        case 'series':
            return hasFormat(state.group)
                ? {...emptyState(), screen: 'format', group: state.group}
                : {...emptyState(), screen: 'root'}
        case 'criterion':
            if (isTvShelf(state)) return {...state, screen: 'series', section: undefined, criterion: undefined, bundle: undefined}
            return hasFormat(state.group)
                ? {...emptyState(), screen: 'format', group: state.group}
                : {...emptyState(), screen: 'root'}
        case 'filter':
        case 'bundles':
            return {...state, screen: 'criterion', criterion: undefined, bundle: undefined}
        case 'direction':
            return {...state, screen: state.criterion === 'filter' ? 'filter' : 'criterion', direction: undefined, ...(state.criterion === 'popular' ? {criterion: undefined} : {})}
        case 'period': {
            // Экрана «Уже вышли / Скоро» не было (сериалы, фильмы с прошедшим «Годом») — назад к фильтру.
            if (state.criterion === 'bundle') return {...state, screen: 'bundles', bundle: undefined, direction: undefined}
            const skippedDirection = isTvShelf(state) || isPastYearRange(state.year)
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
    fm: ['format'],
    ss: ['series'],
    c: ['criterion'],
    bn: ['bundles'],
    sim: ['title'],
    up: ['result'],
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

/**
 * Какую дату показывать у сериалов в карточке: у «Скоро» — первую серию, у «Новых серий» —
 * последнюю серию с номером, у «Новых сезонов» — старт сезона, иначе последнюю серию.
 */
const tvDateFor = (section?: string): TvDate | undefined => {
    if (section === 'series_upcoming') return 'first'
    if (section === 'series_new') return 'episode'
    if (section === 'series_seasons') return 'season'
    return section && SECTIONS[section as keyof typeof SECTIONS]?.mediaType === 'tv' ? 'last' : undefined
}

const sameSelection = (a: WizardState, b: WizardState) =>
    JSON.stringify([a.screen, a.shelf, a.section, a.criterion, a.bundle, a.genres, a.tags, a.year, a.direction]) ===
    JSON.stringify([b.screen, b.shelf, b.section, b.criterion, b.bundle, b.genres, b.tags, b.year, b.direction])

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

/**
 * Тайтлы страницы. В items копятся все загруженные страницы (место rank: 1–10, 11–20, …),
 * поэтому к прошлым можно вернуться; старые записи хранили только текущую — фильтр по rank
 * подходит и для них.
 */
const pageItems = (collection: CollectionRow, page: number) =>
    collection.items.filter(item => item.rank > page * COLLECTION_SIZE && item.rank <= (page + 1) * COLLECTION_SIZE)

/** Сколько страниц уже загружено (с проверенными трейлерами). */
const loadedPages = (collection: CollectionRow) =>
    Math.max(Number(collection.page ?? 0) + 1, Math.ceil(Math.max(0, ...collection.items.map(item => item.rank)) / COLLECTION_SIZE))

/** Перейти на загруженную страницу (защита от двойного нажатия — по прежнему номеру). */
const switchPage = async (collection: CollectionRow, page: number): Promise<CollectionRow | null> => {
    const {data, error} = await getSupabase()
        .from('collections')
        .update({page, updated_at: new Date().toISOString()})
        .eq('id', collection.id)
        .eq('page', Number(collection.page ?? 0))
        .select('id')
    if (error) throw new Error(`[COLLECTIONS] Page switch failed: ${error.message}`)
    return data?.length ? {...collection, page} : null
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
    const items = pageItems(collection, page)
    const count = items.length
    const note = page === 0 ? collectionNote(count, collection.params.match ?? 'and', state) : ''
    const loaded = loadedPages(collection)
    const rest = (collection.candidates ?? []).length
    const hasMore = page + 1 < loaded || rest > 0

    const similar = collection.params.similar
    const bundle = !similar && collection.params.criterion === 'bundle' ? bundleByKey(collection.params.bundle) : undefined
    const footerRows = [
        ...(canPublishCollections(row.telegramId) ? [[btn('🎠 Собрать карусель', 'car')]] : []),
        [
            similar && collection.params.parent_id
                ? btn('◀️ К подборке', 'up', undefined, 'danger')
                : btn('◀️ Назад в меню', 'cb', undefined, 'danger'),
            ...(hasMore ? [btn('🔁 Ещё вариант', 'more', undefined, 'success')] : [])
        ]
    ]

    const target = richTarget(ctx, row)
    const {caption, keyboard} = await constructRichListCard(target, items.map(queryOf), {
        title: collectionHeading(count, page,
            similar ? `🔗 Похоже на «${similar.title}»` : bundle ? `${bundle.emoji} ${bundle.title}` : undefined),
        footerRows,
        tvDate: tvDateFor(collection.params.section),
        itemButton: (text, index) => btn(text, 't', String(index)),
        startNumber: page * COLLECTION_SIZE + 1
    })
    // Под заголовком «Топ-10»: путь со ссылками, отметки фильтра, пояснение.
    caption.blocks.splice(1, 0, ...richBlocks(similar
        ? [{parts: [{text: 'Рекомендации зрителей TMDB и общие темы, та же полка, без своей франшизы.', italic: true}]}]
        : collectionLines(state, collection.params.period, note, botName(ctx))))
    caption.blocks.push(collectionPagesFooter(page, loaded, rest, botName(ctx)))

    // Обложка «Ваш топ готов!» — одна на все страницы и разделы; не принял Telegram — без неё.
    const cover = await coverFor('result', row.messageId)
    if (cover) {
        try {
            await tryGenerateCard(target, {...caption, blocks: [{type: 'photo', photo: {type: 'photo', media: cover}}, ...caption.blocks]}, keyboard)
            return
        } catch (error) {
            console.warn('[COLLECTIONS] Result cover rejected; without cover', (error as any)?.response?.description ?? error)
            forgetCovers()
        }
    }
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

    await showWizard(ctx, row, {note: '⏳ Ищу тайтлы и проверяю трейлеры…', building: true, period: periodCrumb(state, period)})

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
    const mediaType = collection?.params.similar?.media_type ?? section?.mediaType
    const contentType = collection ? shelfForParams(collection.params).contentType : undefined
    const rest = collection?.candidates ?? []

    // Следующая страница уже загружена (вернулись назад по номеру) — просто показать её.
    if (collection && Number(collection.page ?? 0) + 1 < loadedPages(collection)) {
        await safeAnswer(ctx)
        const switched = await switchPage(collection, Number(collection.page ?? 0) + 1)
        if (switched) await showCollection(ctx, row, switched)
        return
    }

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
        const trailers = await findTrailers(mediaType!, batch.map(entry => entry.id))
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
        items: [...collection.items, ...picked.map((entry, index) => ({
            rank: page * COLLECTION_SIZE + index + 1,
            media_type: mediaType!,
            content_type: contentType!,
            id: entry.id,
            score: entry.score,
            trailer_key: entry.trailer.key,
            trailer_language: entry.trailer.language
        }))]
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

/**
 * «🔗 Похожее» из карточки тайтла: подборка похожих (та же полка) — правкой того же сообщения.
 * Новая запись collections с parent_id: «◀️ К подборке» возвращает исходную.
 */
const showSimilar = async (ctx: any, row: WizardRow) => {
    const state = row.state
    const collection = await loadCollection(state.collectionId, row.telegramId)
    const record = collection && state.titleIndex !== undefined
        ? pageItems(collection, Number(collection.page ?? 0))[state.titleIndex]
        : undefined
    if (!collection || !record) return safeAnswer(ctx, 'Тайтл не найден.', true)
    await safeAnswer(ctx, 'Ищу похожее…')

    const shelf = shelfForParams(collection.params)
    const result = await buildSimilar({mediaType: record.media_type, id: record.id}, shelf)
    const current = await loadWizard(row.telegramId)
    if (current.state.screen !== 'title' || current.messageId !== row.messageId) return
    if (!result.items.length) {
        await ctx.reply('😕 Похожих с трейлером не нашлось.').catch(() => undefined)
        return
    }

    const params = {
        ...collection.params,
        similar: {media_type: record.media_type, id: record.id, title: result.title || record.title || ''},
        parent_id: collection.id
    }
    const {data: saved, error} = await getSupabase()
        .from('collections')
        .insert({
            telegram_id: row.telegramId,
            params,
            items: result.items.map((item, index) => ({
                rank: index + 1,
                media_type: item.mediaType,
                content_type: shelf.contentType,
                id: item.id,
                title: item.title,
                year: item.year ?? null,
                score: item.score,
                trailer_key: item.trailer.key,
                trailer_language: item.trailer.language
            })),
            candidates: result.rest,
            page: 0
        })
        .select('id,telegram_id,params,items,candidates,page')
        .single()
    if (error) throw new Error(`[COLLECTIONS] Similar save failed: ${error.message}`)

    row.state = {...state, screen: 'result', collectionId: saved.id, titleIndex: undefined}
    await showCollection(ctx, row, saved as CollectionRow)
    await saveWizard(row)
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
                const next = groupState(group.key)
                if (!next) return safeAnswer(ctx, 'Этот раздел появится на следующих этапах.', true)
                state = next
                break
            }

            case 'fm': {
                const entry = GROUPS.find(item => item.key === state.group)
                const shelf = entry?.shelves.find(key => SHELVES[key].mediaType === arg)
                if (entry && shelf) state = shelfState(entry.key, shelf)
                break
            }

            case 'ss':
                if (arg === 'series_completed' || arg === 'series_new' || arg === 'series_seasons' || arg === 'series_upcoming') {
                    state = {...state, screen: 'criterion', section: arg, ...(arg === 'series_upcoming' ? {year: undefined} : {})}
                }
                break

            case 'c':
                if (arg === 'bundle') state = {...state, screen: 'bundles', criterion: 'bundle', bundle: undefined, genres: [], tags: [], year: undefined}
                if (arg === 'filter') state = {...state, screen: 'filter', criterion: 'filter'}
                if (arg === 'popular') state = afterCriterion({...state, criterion: 'popular', genres: [], tags: [], year: undefined})
                break

            case 'bn': {
                const bundle = bundleByKey(arg)
                if (!bundle || !state.section || !bundleFits(bundle, shelfKeyOf(state), state.section)) return safeAnswer(ctx)
                state = afterCriterion({...state, bundle: bundle.key})
                break
            }

            case 'f':
                state = arg === 't' ? {...state, openTags: !state.openTags}
                    : arg === 'y' ? {...state, openYear: !state.openYear}
                        : {...state, openGenres: !state.openGenres}
                break

            case 'tg':
                if (arg && genresForSection(SECTIONS[state.section ?? 'movies']).some(genre => genre.key === arg)) {
                    state = {...state, genres: toggle(state.genres, arg)}
                }
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
                const record = collection ? pageItems(collection, Number(collection.page ?? 0))[Number(arg)] : undefined
                if (!record) return safeAnswer(ctx, 'Тайтл не найден.', true)
                await safeAnswer(ctx)
                await engineRichCard(richTarget(ctx, row), queryOf(record), {
                    footerRows: [[btn('🔗 Похожее', 'sim', undefined, 'success')], [btn('◀️ К подборке', 'l', undefined, 'danger')]]
                })
                row.state = {...state, screen: 'title', titleIndex: Number(arg)}
                await saveWizard(row)
                return
            }

            case 'sim':
                await showSimilar(ctx, row)
                return

            case 'up': {
                const current = await loadCollection(state.collectionId, telegramId)
                const parent = await loadCollection(current?.params.parent_id, telegramId)
                if (!parent) return safeAnswer(ctx, 'Подборка не найдена — соберите новую.', true)
                await safeAnswer(ctx)
                row.state = {...state, screen: 'result', collectionId: parent.id}
                await showCollection(ctx, row, parent)
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

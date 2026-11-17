import {Markup} from 'telegraf'
import {COLLECTION_ACTION} from '#server/bot/callbacks/routes'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {engineRichListCard} from '#server/global/engine/card/engineRichListCard'
import {buildCollectionWidening, COLLECTION_SIZE, type CollectionItem} from '#server/global/engine/collections/buildCollection'
import {findTrailers} from '#server/global/engine/collections/trailers'
import {genreByKey, periodByKey, SECTIONS, tagByKey, type PeriodKey} from '#server/global/engine/collections/catalog'
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
import {collectionTitle, GROUPS, renderWizard, widenedNote} from '#server/bot/actions/collections/wizardView'

/**
 * Мастер подборок /g (план — TASKS.md «ТЕКУЩАЯ ЗАДАЧА: подборки /g»):
 * Подборка → раздел → (сериалы: новые / новые серии) → Фильтр или Популярное →
 * Уже вышли / Скоро → интервал → карточка «топ-10 с трейлерами».
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
const showWizard = async (ctx: any, row: WizardRow, note?: string) => {
    const {text, keyboard} = renderWizard(row.state, note)
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
                ? {...state, screen: 'series', criterion: undefined}
                : {...emptyState(), screen: 'root'}
        case 'filter':
            return {...state, screen: 'criterion', criterion: undefined}
        case 'direction':
            return {...state, screen: state.criterion === 'filter' ? 'filter' : 'criterion', direction: undefined, ...(state.criterion === 'popular' ? {criterion: undefined} : {})}
        case 'period':
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
    rs: ['filter'],
    ok: ['filter'],
    d: ['direction'],
    p: ['period']
}

const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter(item => item !== key) : [...list, key]

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

/** Интервал выбран: собрать топ, сохранить подборку, прислать карточку. */
const buildAndSend = async (ctx: any, row: WizardRow, period: PeriodKey) => {
    const state = row.state
    if (!state.section || !state.criterion || !periodByKey(period)) {
        await showWizard(ctx, {...row, state: emptyState()})
        return
    }

    await showWizard(ctx, row, '⏳ Собираю топ: ищу тайтлы и проверяю трейлеры…')

    const params = {
        section: state.section,
        criterion: state.criterion,
        ...(state.criterion === 'filter' ? {genres: state.genres, tags: state.tags} : {}),
        period
    }

    const result = await buildCollectionWidening(params)
    if (!result.items.length) {
        await showWizard(ctx, row, '😕 Ничего не нашлось даже за самый широкий период. Попробуйте другие жанры или теги.')
        return
    }

    const {data: saved, error} = await getSupabase()
        .from('collections')
        .insert({
            telegram_id: row.telegramId,
            params: {...params, requested_period: result.requestedPeriod, used_period: result.usedPeriod},
            items: result.items.map(itemRecord),
            candidates: result.rest,
            page: 0
        })
        .select('id')
        .single()
    if (error) throw new Error(`[COLLECTIONS] Save failed: ${error.message}`)

    const note = widenedNote(result.requestedPeriod, result.usedPeriod, result.items.length)
    await engineRichListCard(ctx, result.items.map(toQuery), {
        title: collectionTitle(state, result.items.length, result.requestedPeriod, result.usedPeriod) + (note ? `\n${note}` : ''),
        footerRows: cardFooter(row.telegramId, saved.id, result.rest.length > 0)
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
        section: collection.params.section,
        criterion: collection.params.criterion,
        genres: collection.params.genres ?? [],
        tags: collection.params.tags ?? []
    }
    await engineRichListCard(ctx, picked.map(entry => ({
        id: entry.id,
        type: section.mediaType,
        status: 'ready' as const,
        contentType: section.contentType as ContentType,
        keyTrailer: entry.trailer.key
    })), {
        title: collectionTitle(state, picked.length, collection.params.requested_period, collection.params.used_period, page),
        footerRows: cardFooter(Number(ctx.from.id), collectionId, remaining.length > 0)
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
                if (arg === 'series_new' || arg === 'series_airing') state = {...state, screen: 'criterion', section: arg}
                break

            case 'c':
                if (arg === 'filter') state = {...state, screen: 'filter', criterion: 'filter'}
                if (arg === 'popular') state = {...state, screen: 'direction', criterion: 'popular', genres: [], tags: []}
                break

            case 'f':
                state = arg === 't' ? {...state, openTags: !state.openTags} : {...state, openGenres: !state.openGenres}
                break

            case 'tg':
                if (arg && genreByKey(arg)) state = {...state, genres: toggle(state.genres, arg)}
                break

            case 'tt':
                if (arg && tagByKey(arg)) state = {...state, tags: toggle(state.tags, arg)}
                break

            case 'rs':
                state = {...state, genres: [], tags: []}
                break

            case 'ok':
                if (!state.genres.length && !state.tags.length) {
                    return safeAnswer(ctx, 'Отметьте хотя бы один жанр или тег.', true)
                }
                state = {...state, screen: 'direction'}
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
        await showWizard(ctx, row)
        await saveWizard(row)

    } catch (error) {
        console.error('[COLLECTIONS ACTION ERROR]', {action, arg, message: error instanceof Error ? error.message : error})
        await safeAnswer(ctx, 'Не получилось — попробуйте ещё раз.', true)
    }
}

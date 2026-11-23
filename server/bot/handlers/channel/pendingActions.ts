import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {saveTelegramUser} from '#server/bot/handlers/auth/success/saveTelegramUser'
import {failedChannelSubscriber} from '#server/bot/handlers/auth/fail/failedChannelSubscriber'
import {missingChannels} from '#server/bot/handlers/channel/requiredChannels'
import {addPending, botStartLink, isActionPayload, livePending} from '#server/bot/handlers/channel/actionPayload'

export {ACTION_PAYLOAD, PENDING_TTL_MS, MAX_PENDING, isActionPayload, mediaActionPayload, parseMediaAction, botStartLink, addPending, livePending} from '#server/bot/handlers/channel/actionPayload'

/**
 * Доступ к действиям бота и отложенные действия (решение владельца 23.11).
 *
 * Действие разрешено, если человек подписан на оба обязательных канала И запускал бота (есть в users,
 * сводки ему доставляются). Иначе:
 *   - кнопка под постом / в чужом чате → ответ на нажатие открывает бота ссылкой ?start=<действие>;
 *   - в боте /start <действие> без подписки → действие запоминается на 24 часа (users.pending_actions)
 *     и бот просит подписаться;
 *   - человек подписался (update chat_member или «Проверить подписку») → все запомненные действия
 *     выполняются по порядку: бот «повторяет» /start <действие> от имени человека.
 * Действие — это payload ссылки /start: одна запись и для запоминания, и для повтора.
 */
/** Бот может писать человеку: запускал бота и не блокировал (сводка не отбивалась). */
const reachableUser = async (telegramId: number): Promise<boolean> => {
    const {data, error} = await (getSupabase() as any).from('users').select('id,bot_blocked_at').eq('telegram_id', telegramId).maybeSingle()
    if (error) console.warn('[ACCESS] users', error.message)
    return Boolean(data && !data.bot_blocked_at)
}

/** Колонки users.pending_actions ещё нет (миграция не применена) — бот работает без запоминания. */
const isMissingColumn = (error: any) => error?.code === '42703' || error?.code === 'PGRST204'

/**
 * Запомнить действие в users.pending_actions (строка users уже есть: saveTelegramUser / человек в боте).
 * true — запомнено: обещать «выполнится само» можно только тогда.
 */
export const rememberAction = async (telegramId: number, payload: string): Promise<boolean> => {
    if (!isActionPayload(payload)) return false
    const supabase = getSupabase() as any
    const {data, error} = await supabase.from('users').select('pending_actions').eq('telegram_id', telegramId).maybeSingle()
    if (error || !data) {
        if (error && !isMissingColumn(error)) console.warn('[ACCESS] действие не запомнено', error.message)
        return false
    }
    const {error: writeError} = await supabase.from('users')
        .update({pending_actions: addPending(data.pending_actions, payload, Date.now())}).eq('telegram_id', telegramId)
    if (writeError) console.warn('[ACCESS] действие не запомнено', writeError.message)
    return !writeError
}

/**
 * Кнопка-действие (callback): true — можно выполнять. Иначе человек уже получил ответ: в боте —
 * просьбу подписаться (действие запомнено), под постом или в другом чате — переход в бота по ссылке.
 */
export const gateCallback = async (ctx: any, payload: string): Promise<boolean> => {
    const telegramId = ctx.from.id
    const [missing, reachable] = await Promise.all([missingChannels(ctx.telegram, telegramId), reachableUser(telegramId)])
    if (!missing.length && reachable) return true

    const inBotChat = ctx.chat?.type === 'private' && !ctx.inlineMessageId
    if (inBotChat && reachable) {
        const remembered = await rememberAction(telegramId, payload)
        await failedChannelSubscriber(ctx)
        await ctx.answerCbQuery(remembered
            ? 'Подпишитесь на каналы — и действие выполнится само'
            : 'Подпишитесь на каналы, затем нажмите кнопку ещё раз').catch(() => undefined)
        return false
    }
    await ctx.answerCbQuery(undefined, {url: botStartLink(ctx, payload)}).catch(async (error: any) => {
        console.warn('[ACCESS] ссылка в бота не открылась', error?.description ?? error?.message)
        await ctx.answerCbQuery('Откройте бота @kinomanovNet_bot и подпишитесь на каналы', {show_alert: true}).catch(() => undefined)
    })
    return false
}

/**
 * /start <действие>: человек в боте (теперь он есть в users, сводки снова доставляются). Без подписки
 * действие запоминается, бот просит подписаться; false — выполнять не надо. Повтор после подписки
 * (replayStart) подписку уже проверил — второй раз не смотрим (getChatMember может отстать).
 */
export const ensureAccessOnStart = async (ctx: any, payload: string): Promise<boolean> => {
    await saveTelegramUser(ctx).catch(error => console.error('[ACCESS] Save user failed', error?.message ?? error))
    const supabase = getSupabase() as any
    if (ctx.message?.kinomanov_replay) {
        await supabase.from('users').update({subscriber: true, bot_blocked_at: null}).eq('telegram_id', ctx.from.id)
        return true
    }
    const missing = await missingChannels(ctx.telegram, ctx.from.id)
    await supabase.from('users').update({subscriber: !missing.length, bot_blocked_at: null}).eq('telegram_id', ctx.from.id)
    if (!missing.length) return true
    await rememberAction(ctx.from.id, payload)
    await failedChannelSubscriber(ctx)
    return false
}

/** Повтор /start <действие> от имени человека — регистрирует registerHandlers (там есть bot). */
type Replay = (user: any, payload: string) => Promise<unknown>
let replayStart: Replay | null = null

export const setStartReplay = (bot: any) => {
    replayStart = (user, payload) => bot.handleUpdate({
        update_id: 0,
        message: {
            message_id: 0,
            date: Math.floor(Date.now() / 1000),
            chat: {id: user.id, type: 'private', first_name: user.first_name, username: user.username},
            from: {id: user.id, is_bot: false, first_name: user.first_name, username: user.username},
            text: `/start ${payload}`,
            entities: [{type: 'bot_command', offset: 0, length: 6}],
            kinomanov_replay: true
        }
    })
}

/** Подписка подтверждена: выполнить запомненные действия (не старше 24 ч, до 10, старые первыми). Возвращает их число. */
export const runPendingActions = async (user: {id: number, first_name?: string, username?: string}): Promise<number> => {
    if (!replayStart) return 0
    const supabase = getSupabase() as any
    const {data, error} = await supabase.from('users').select('pending_actions').eq('telegram_id', user.id).maybeSingle()
    if (error) {
        if (!isMissingColumn(error)) console.warn('[ACCESS] отложенные действия', error.message)
        return 0
    }
    const stored = data?.pending_actions
    if (!Array.isArray(stored) || !stored.length) return 0
    // Захват: список очищается, только если он не изменился с чтения — событие подписки и «Проверить
    // подписку» не выполнят действия дважды.
    const {data: claimed, error: claimError} = await supabase.from('users').update({pending_actions: []})
        .eq('telegram_id', user.id).eq('pending_actions', JSON.stringify(stored)).select('id')
    if (claimError) console.warn('[ACCESS] отложенные действия', claimError.message)
    if (!claimed?.length) return 0

    const actions = livePending(stored, Date.now())
    for (const action of actions) {
        await replayStart(user, action.payload).catch(error => console.error('[ACCESS] повтор действия', action.payload, error?.message ?? error))
    }
    return actions.length
}

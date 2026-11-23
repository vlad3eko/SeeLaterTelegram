import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {isMissingTable} from '#server/global/engine/collections/trailers'
import {saveTelegramUser} from '#server/bot/handlers/auth/success/saveTelegramUser'
import {failedChannelSubscriber} from '#server/bot/handlers/auth/fail/failedChannelSubscriber'
import {missingChannels} from '#server/bot/handlers/channel/requiredChannels'
import {botStartLink, isActionPayload, MAX_PENDING, PENDING_TTL_MS} from '#server/bot/handlers/channel/actionPayload'

export {ACTION_PAYLOAD, PENDING_TTL_MS, MAX_PENDING, isActionPayload, mediaActionPayload, parseMediaAction, botStartLink} from '#server/bot/handlers/channel/actionPayload'

/**
 * Доступ к действиям бота и отложенные действия (решение владельца 23.11).
 *
 * Действие разрешено, если человек подписан на оба обязательных канала И запускал бота (есть в users,
 * сводки ему доставляются). Иначе:
 *   - кнопка под постом / в чужом чате → ответ на нажатие открывает бота ссылкой ?start=<действие>;
 *   - в боте /start <действие> без подписки → действие запоминается на 24 часа (bot_pending_actions)
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

export const rememberAction = async (telegramId: number, payload: string) => {
    if (!isActionPayload(payload)) return
    const now = Date.now()
    const {error} = await (getSupabase() as any).from('bot_pending_actions').upsert({
        telegram_id: telegramId, payload, created_at: new Date(now).toISOString(),
        expires_at: new Date(now + PENDING_TTL_MS).toISOString(), done_at: null
    }, {onConflict: 'telegram_id,payload'})
    if (error && !isMissingTable(error)) console.warn('[ACCESS] действие не запомнено', error.message)
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
        await rememberAction(telegramId, payload)
        await failedChannelSubscriber(ctx)
        await ctx.answerCbQuery('Подпишитесь на каналы — и действие выполнится само').catch(() => undefined)
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
    const {data, error} = await supabase.from('bot_pending_actions').select('id,payload')
        .eq('telegram_id', user.id).is('done_at', null).gt('expires_at', new Date().toISOString())
        .order('created_at', {ascending: true}).limit(MAX_PENDING)
    if (error) {
        if (!isMissingTable(error)) console.warn('[ACCESS] отложенные действия', error.message)
        return 0
    }
    let done = 0
    for (const row of data ?? []) {
        // Захват: событие подписки и «Проверить подписку» не выполнят действие дважды.
        const {data: claimed} = await supabase.from('bot_pending_actions')
            .update({done_at: new Date().toISOString()}).eq('id', row.id).is('done_at', null).select('id')
        if (!claimed?.length || !isActionPayload(row.payload)) continue
        await replayStart(user, row.payload).catch(error => console.error('[ACCESS] повтор действия', row.payload, error?.message ?? error))
        done++
    }
    return done
}

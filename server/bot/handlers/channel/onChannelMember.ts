import {Markup} from 'telegraf'
import {keyboardStartBot} from '#server/bot/consts/buttons/keyboardBot'
import {subscribeButtons} from '#server/bot/handlers/auth/fail/failedChannelSubscriber'
import {channelLines, isMemberStatus, missingChannels, requiredChannelByUsername} from '#server/bot/handlers/channel/requiredChannels'
import {continueInstagramAfterSubscribe} from '#server/bot/actions/instagram/instagramSave'
import {runPendingActions} from '#server/bot/handlers/channel/pendingActions'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {addMessageSession} from '#server/bot/services/session/addMessageSession'
import {SessionMessageType} from '#server/bot/consts/types/SessionMessageTypes'

/**
 * Update chat_member из обязательного канала (бот — администратор, в allowed_updates вебхука есть
 * chat_member, см. scripts/setTelegramWebhook.mjs). Человек подписался — не нужно возвращаться в бота
 * и нажимать «Проверить подписку»:
 *   - переходы из Instagram, ждущие подписки, сохраняются сами (continueInstagramAfterSubscribe);
 *   - запомненные действия (кнопки, нажатые без подписки) выполняются (runPendingActions);
 *   - остальным, кого бот просил подписаться (users.subscriber = false), — «✅ Подписка подтверждена»;
 *   - если подписан только на один из двух каналов — напоминание о втором.
 * Отписка снимает users.subscriber. Пишем только тем, кто уже есть в users (запускал бота).
 */
export const onChannelMember = async (ctx: any) => {
    const update = ctx.chatMember ?? ctx.update?.chat_member
    const channel = requiredChannelByUsername(update?.chat?.username)
    const user = update?.new_chat_member?.user
    if (!channel || !user || user.is_bot) return

    const wasMember = isMemberStatus(update.old_chat_member?.status, update.old_chat_member?.is_member)
    const isMember = isMemberStatus(update.new_chat_member?.status, update.new_chat_member?.is_member)
    if (wasMember === isMember) return

    const supabase = getSupabase() as any
    const {data: row, error} = await supabase.from('users').select('id,subscriber').eq('telegram_id', user.id).maybeSingle()
    if (error) console.warn('[CHANNEL MEMBER] users', error.message)

    if (!isMember) {
        if (row?.subscriber) await supabase.from('users').update({subscriber: false}).eq('telegram_id', user.id)
        return
    }

    // Канал из апдейта точно подписан — не перепроверяем его (getChatMember может отстать).
    const missingNow = async () => (await missingChannels(ctx.telegram, user.id)).filter(item => item !== channel)
    let missing = await missingNow()
    // Подписался на оба подряд: апдейты идут параллельно, getChatMember второго канала может ещё не знать о
    // подписке — иначе оба апдейта сказали бы «остался ещё один», и отложенные действия не выполнил бы никто.
    if (missing.length) {
        await new Promise(resolve => setTimeout(resolve, 1500))
        missing = await missingNow()
    }
    const handled = await continueInstagramAfterSubscribe(ctx.telegram, user.id, missing)
        .catch(error => {
            console.error('[CHANNEL MEMBER] Instagram', error?.message ?? error)
            return false
        })
    if (!row) return

    if (missing.length) {
        if (!handled && row.subscriber === false) {
            await ctx.telegram.sendMessage(user.id, `Спасибо за подписку! Остался ещё один канал:\n\n${channelLines(missing)}`,
                Markup.inlineKeyboard(subscribeButtons(missing))).catch(() => undefined)
        }
        return
    }

    await supabase.from('users').update({subscriber: true}).eq('telegram_id', user.id)
    const done = await runPendingActions(user).catch(error => {
        console.error('[CHANNEL MEMBER] отложенные действия', error?.message ?? error)
        return 0
    })
    if (handled || done || row.subscriber !== false) return
    const message = await ctx.telegram.sendMessage(user.id,
        '✅ Подписка подтверждена — бот открыт. Ищите фильмы кнопками ниже или напишите название в чат.',
        {reply_markup: keyboardStartBot()}).catch(() => null)
    if (message) await addMessageSession(user.id, SessionMessageType.Menu, {messageId: message.message_id}).catch(() => undefined)
}

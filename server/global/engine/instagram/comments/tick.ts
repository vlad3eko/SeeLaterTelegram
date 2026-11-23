import {isMissingTable} from '#server/global/engine/collections/trailers'
import {discoverReels} from '#server/global/engine/instagram/comments/campaigns'
import {accountFailure, instagramUsage} from '#server/global/engine/instagram/comments/graph'
import {igCommentsMode} from '#server/global/engine/instagram/comments/plan'
import {pollCampaigns} from '#server/global/engine/instagram/comments/poll'
import {forgetOldLeads, sendQueued} from '#server/global/engine/instagram/comments/send'
import {ADMIN_TELEGRAM_ID} from '#server/global/oneLinkApp'

/**
 * Один проход Instagram «СОХРАНИТЬ» (таймер /api/bot/instagram/tick, Cloud Scheduler каждые 2 минуты; вебхук Meta):
 * новые Reels → вопрос администратору; комментарии активных кампаний → очередь; очередь → Direct.
 * INSTAGRAM_COMMENTS: off — ничего; log — первые два шага без Direct (записи logged); send — всё.
 */
export const runInstagramTick = async (supabase: any, telegram: any, now: Date, {deadline}: {deadline: number}) => {
    const mode = igCommentsMode()
    if (mode === 'off') return {skipped: 'INSTAGRAM_COMMENTS=off'}
    const result: Record<string, any> = {mode}
    try {
        // Новые Reels — раз в 10 минут (каждый пятый запуск): дальше всё равно ждём решения администратора, а запрос
        // списка медиа тратит тот же лимит, что и опрос.
        if (now.getUTCMinutes() % 10 === 0) result.discover = await discoverReels(supabase, telegram, now)
        if (Date.now() < deadline) result.poll = await pollCampaigns(supabase, now, {deadline, mode})
        if (mode === 'send' && Date.now() < deadline) result.send = await sendQueued(supabase, telegram, now, {deadline})
        if (now.getUTCMinutes() < 5 && now.getUTCHours() === 1) await forgetOldLeads(supabase, now)
    } catch (error: any) {
        if (isMissingTable(error)) return {skipped: 'нет таблиц instagram_* (миграция instagram_save.sql)'}
        // Новый статус logged без миграции instagram_fixes.sql нарушает check-ограничение.
        if (error?.code === '23514') return {skipped: 'примените миграцию database/migrations/instagram_fixes.sql', error: error.message}
        throw error
    }
    result.usage = instagramUsage()
    await warnAccountFailure(telegram, now, accountFailure(result))
    return result
}

/** Предупреждение администратору — не чаще раза в час (первый тик часа), чтобы не засыпать чат. */
const warnAccountFailure = async (telegram: any, now: Date, failure: string | null) => {
    if (!failure || now.getUTCMinutes() >= 5) return
    const text = [
        '⚠️ Instagram «СОХРАНИТЬ»: Meta не принимает запросы — токен или права приложения.',
        failure.slice(0, 300),
        '',
        'Ответы на комментарии ждут в очереди и уйдут после исправления (если комментарию меньше 7 дней).'
    ].join('\n')
    await telegram.sendMessage(ADMIN_TELEGRAM_ID, text).catch((error: any) =>
        console.warn('[IG TICK] предупреждение администратору не отправлено', error?.response?.description ?? error?.message ?? error))
}

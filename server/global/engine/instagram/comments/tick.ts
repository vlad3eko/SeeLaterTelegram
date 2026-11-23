import {isMissingTable} from '#server/global/engine/collections/trailers'
import {discoverReels} from '#server/global/engine/instagram/comments/campaigns'
import {igCommentsMode} from '#server/global/engine/instagram/comments/plan'
import {pollCampaigns} from '#server/global/engine/instagram/comments/poll'
import {forgetOldLeads, sendQueued} from '#server/global/engine/instagram/comments/send'

/**
 * Один проход Instagram «СОХРАНИТЬ» (таймер /api/bot/instagram/tick, Cloud Scheduler каждые 5 минут):
 * новые Reels → вопрос администратору; комментарии активных кампаний → очередь; очередь → Direct.
 * INSTAGRAM_COMMENTS: off — ничего; log — первые два шага без Direct; send — всё.
 */
export const runInstagramTick = async (supabase: any, telegram: any, now: Date, {deadline}: {deadline: number}) => {
    const mode = igCommentsMode()
    if (mode === 'off') return {skipped: 'INSTAGRAM_COMMENTS=off'}
    const result: Record<string, unknown> = {mode}
    try {
        result.discover = await discoverReels(supabase, telegram, now)
        if (Date.now() < deadline) result.poll = await pollCampaigns(supabase, now, {deadline})
        if (mode === 'send' && Date.now() < deadline) result.send = await sendQueued(supabase, telegram, now, {deadline})
        if (now.getUTCMinutes() < 5 && now.getUTCHours() === 1) await forgetOldLeads(supabase, now)
    } catch (error) {
        if (isMissingTable(error)) return {skipped: 'нет таблиц instagram_* (миграция instagram_save.sql)'}
        throw error
    }
    return result
}

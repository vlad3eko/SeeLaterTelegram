import {graphFailureText, instagramAccountId, isMissingObject, listComments} from '#server/global/engine/instagram/comments/graph'
import {commentsCutoff, draftLeads, newestTimestamp, nextPollAt, REPLIED_STATUSES} from '#server/global/engine/instagram/comments/plan'

/**
 * Опрос комментариев активных кампаний. Аренда кампании (poll_lease_until) — два параллельных тика
 * не читают одну кампанию; повторное чтение перекрытия безопасно: comment_id уникален.
 */
const MAX_CAMPAIGNS_PER_TICK = 10
const LEASE_MS = 2 * 60_000

export const pollCampaigns = async (supabase: any, now: Date, {deadline, mode = 'send'}: {deadline: number, mode?: 'log' | 'send'}) => {
    const account = instagramAccountId()
    if (!account) return {campaigns: 0, error: 'нет INSTAGRAM_ACCOUNT_ID'}
    const nowIso = now.toISOString()
    const {data: due, error} = await supabase.from('instagram_campaigns')
        .select('id,instagram_media_id,published_at,last_seen_at')
        .eq('status', 'active')
        .or(`next_poll_at.is.null,next_poll_at.lte."${nowIso}"`)
        .order('next_poll_at', {ascending: true, nullsFirst: true})
        .limit(MAX_CAMPAIGNS_PER_TICK)
    if (error) throw error

    const result = {campaigns: 0, queued: 0, logged: 0, duplicate: 0, expired: 0, completed: 0, errors: [] as string[]}
    for (const campaign of due ?? []) {
        if (Date.now() >= deadline) break
        const {data: leased} = await supabase.from('instagram_campaigns')
            .update({poll_lease_until: new Date(now.getTime() + LEASE_MS).toISOString()})
            .eq('id', campaign.id)
            .or(`poll_lease_until.is.null,poll_lease_until.lt."${nowIso}"`)
            .select('id')
        if (!leased?.length) continue
        result.campaigns++

        const next = nextPollAt(campaign.published_at, now)
        const comments = await listComments(campaign.instagram_media_id, {stopBefore: commentsCutoff(campaign.last_seen_at, campaign.published_at, now)})
        if (!comments.ok) {
            const text = graphFailureText(comments)
            result.errors.push(text)
            // Reel удалён или окно опроса вышло — кампания закрывается, а не опрашивается с ошибкой вечно.
            const close = !next || isMissingObject(comments)
            await supabase.from('instagram_campaigns').update({
                last_error: text, poll_lease_until: null, updated_at: nowIso,
                ...(close ? {status: 'completed', next_poll_at: null} : {next_poll_at: new Date(now.getTime() + 15 * 60_000).toISOString()})
            }).eq('id', campaign.id)
            if (close) result.completed++
            continue
        }
        const {truncated} = comments.data
        if (truncated) console.warn('[IG POLL] прочитано не всё — отметка не сдвигается, дочитаем в следующем проходе', campaign.id)

        // «Уже ответили» — только тем, кому ответ ушёл или уходит: после logged / send_failed / expired новый комментарий получает ответ.
        const {data: known, error: knownError} = await supabase.from('instagram_comment_leads')
            .select('commenter_id').eq('campaign_id', campaign.id).not('commenter_id', 'is', null).in('status', [...REPLIED_STATUSES])
        if (knownError) throw knownError
        const existingIds = new Set<string>((known ?? []).map((row: any) => String(row.commenter_id)))
        const drafts = draftLeads(comments.data.comments, {account, knownCommenters: existingIds, now, mode})
        if (drafts.length) {
            const {data: inserted, error: insertError} = await supabase.from('instagram_comment_leads')
                .upsert(drafts.map(draft => ({...draft, campaign_id: campaign.id})), {onConflict: 'comment_id', ignoreDuplicates: true})
                .select('status')
            if (insertError) throw insertError
            for (const row of inserted ?? []) result[row.status as 'queued' | 'logged' | 'duplicate' | 'expired']++
        }

        await supabase.from('instagram_campaigns').update({
            last_seen_at: truncated ? campaign.last_seen_at : newestTimestamp(comments.data.comments, campaign.last_seen_at),
            // Окно опроса (30 дней) вышло — закрываем даже недочитанную: старым комментариям Meta ответить уже не даст.
            next_poll_at: next?.toISOString() ?? null,
            status: next ? 'active' : 'completed',
            poll_lease_until: null,
            last_error: null,
            updated_at: nowIso
        }).eq('id', campaign.id)
        if (!next) result.completed++
    }
    return result
}

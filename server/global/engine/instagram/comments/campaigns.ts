import {Markup} from 'telegraf'
import {IG_CAMPAIGN} from '#server/bot/callbacks/routes'
import {ADMIN_TELEGRAM_ID} from '#server/global/oneLinkApp'
import {listRecentMedia, graphFailureText} from '#server/global/engine/instagram/comments/graph'
import {igCommentsMode, rankCandidates, REPLY_WINDOW_MS, type Candidate, type JobForMatch} from '#server/global/engine/instagram/comments/plan'

/**
 * Кампании «СОХРАНИТЬ»: Reel ↔ фильм. Reels выкладываются вручную (reelTarget = telegram_manual),
 * id Reel в задаче нет — таймер находит новые Reels аккаунта сам и спрашивает администратора,
 * какой это фильм (варианты — по подписи из reel_processing_jobs). Без подтверждения Direct не уходит.
 */
export type CampaignRow = {
    id: string
    instagram_media_id: string
    permalink: string | null
    published_at: string | null
    candidates: Candidate[]
    media_id: number | null
    media_type: 'movie' | 'tv' | null
    title: string | null
    status: 'pending' | 'active' | 'ignored' | 'completed'
    admin_message_id: number | null
    last_seen_at: string | null
}

const jobTitle = (job: any) => {
    const media = job.input_payload?.session?.media
    return String(media?.title || media?.name || `${job.media_type} ${job.media_id}`)
}

const loadRecentJobs = async (supabase: any): Promise<Array<JobForMatch & {title: string}>> => {
    const since = new Date(Date.now() - 10 * 24 * 3600_000).toISOString()
    const {data, error} = await supabase.from('reel_processing_jobs')
        .select('media_id,media_type,instagram_caption,published_at,input_payload')
        .gte('published_at', since).order('published_at', {ascending: false}).limit(15)
    if (error) throw error
    return (data ?? []).map((job: any) => ({...job, title: jobTitle(job)}))
}

export const campaignAdminText = (campaign: Pick<CampaignRow, 'permalink' | 'published_at' | 'candidates'>, mode = igCommentsMode()): string => {
    const when = campaign.published_at ? new Date(campaign.published_at).toLocaleString('ru-RU', {timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'}) : ''
    return [
        `📸 Новый Reel в Instagram${when ? ` (${when})` : ''}`,
        ...(campaign.permalink ? [campaign.permalink] : []),
        '',
        campaign.candidates.length
            ? (mode === 'send'
                ? 'Какой это фильм? После подтверждения на комментарии «СОХРАНИТЬ» под ним будет уходить ссылка в Direct.'
                : 'Какой это фильм? Сейчас режим log: комментарии «СОХРАНИТЬ» только записываются, Direct не уходит.')
            : 'Фильм по подписи не нашёлся. Если это не кампания «СОХРАНИТЬ» — нажмите кнопку.'
    ].join('\n')
}

export const campaignAdminKeyboard = (campaign: Pick<CampaignRow, 'id' | 'candidates'>) => Markup.inlineKeyboard([
    ...campaign.candidates.map((candidate, index) => [Markup.button.callback(
        `✅ ${candidate.title}`.slice(0, 60), IG_CAMPAIGN.encode({campaignId: campaign.id, choice: index})
    )]),
    [Markup.button.callback('🚫 Не кампания', IG_CAMPAIGN.encode({campaignId: campaign.id, choice: 'n'}))]
])

/** Новые Reels за последние 7 дней → pending-кампании; администратору — вопрос с кнопками. */
export const discoverReels = async (supabase: any, telegram: any, now: Date): Promise<{found: number, error?: string}> => {
    const media = await listRecentMedia(10)
    if (!media.ok) return {found: 0, error: graphFailureText(media)}
    const reels = media.data.filter(item => item.media_product_type === 'REELS' && now.getTime() - Date.parse(item.timestamp) < REPLY_WINDOW_MS)
    if (!reels.length) return {found: 0}

    const {data: known, error} = await supabase.from('instagram_campaigns').select('instagram_media_id')
        .in('instagram_media_id', reels.map(reel => reel.id))
    if (error) throw error
    const knownIds = new Set((known ?? []).map((row: any) => row.instagram_media_id))
    const fresh = reels.filter(reel => !knownIds.has(reel.id))

    if (fresh.length) {
        const jobs = await loadRecentJobs(supabase)
        for (const reel of fresh) {
            const candidates = rankCandidates(reel, jobs, job => (job as any).title)
            const {error: insertError} = await supabase.from('instagram_campaigns').upsert({
                instagram_media_id: reel.id,
                permalink: reel.permalink ?? null,
                caption: reel.caption?.slice(0, 500) ?? null,
                published_at: new Date(reel.timestamp).toISOString(),
                candidates
            }, {onConflict: 'instagram_media_id', ignoreDuplicates: true})
            if (insertError) throw insertError
        }
    }
    await askAdmin(supabase, telegram)
    return {found: fresh.length}
}

/**
 * Вопрос администратору по кампаниям, где он ещё не отправлен (повтор, если Telegram был недоступен).
 * Перед отправкой кампания захватывается (admin_message_id null → 0): два параллельных тика не пришлют
 * вопрос дважды. Не отправилось — захват снимается, спросим в следующем тике.
 */
const ASKING = 0
const askAdmin = async (supabase: any, telegram: any) => {
    const {data, error} = await supabase.from('instagram_campaigns')
        .select('id,permalink,published_at,candidates').eq('status', 'pending').is('admin_message_id', null).limit(3)
    if (error) throw error
    for (const campaign of data ?? []) {
        const {data: claimed, error: claimError} = await supabase.from('instagram_campaigns')
            .update({admin_message_id: ASKING}).eq('id', campaign.id).is('admin_message_id', null).select('id')
        if (claimError) throw claimError
        if (!claimed?.length) continue
        let messageId: number | null = null
        try {
            const message = await telegram.sendMessage(ADMIN_TELEGRAM_ID, campaignAdminText(campaign), {
                link_preview_options: {is_disabled: true},
                ...campaignAdminKeyboard(campaign)
            })
            messageId = message.message_id
        } catch (error: any) {
            console.warn('[IG CAMPAIGN] вопрос администратору не отправлен', error?.response?.description ?? error?.message ?? error)
        }
        const {error: saveError} = await supabase.from('instagram_campaigns')
            .update({admin_message_id: messageId, updated_at: new Date().toISOString()}).eq('id', campaign.id)
        if (saveError) console.warn('[IG CAMPAIGN] не записан id вопроса администратору', saveError.message)
    }
}

/**
 * Ответ администратора: вариант фильма → active (опрос с ближайшего тика), «Не кампания» → ignored.
 * Только из pending: старая кнопка в чате (или второе нажатие) не меняет фильм у идущей кампании и не
 * воскрешает закрытую — вместо этого текст о текущем состоянии.
 */
export const decideCampaign = async (supabase: any, campaignId: string, choice: number | 'n', mode = igCommentsMode()): Promise<{text: string} | null> => {
    const {data: campaign, error} = await supabase.from('instagram_campaigns').select('*').eq('id', campaignId).maybeSingle()
    if (error) throw error
    if (!campaign) return null
    if (campaign.status !== 'pending') return {text: decidedText(campaign, mode)}
    const now = new Date().toISOString()
    let fields: Record<string, unknown>
    if (choice === 'n') fields = {status: 'ignored'}
    else {
        const candidate = (campaign.candidates as Candidate[])[choice]
        if (!candidate) return null
        fields = {status: 'active', media_id: candidate.mediaId, media_type: candidate.mediaType, title: candidate.title, next_poll_at: now}
    }
    const {data: updated, error: updateError} = await supabase.from('instagram_campaigns')
        .update({...fields, updated_at: now}).eq('id', campaignId).eq('status', 'pending').select('*')
    if (updateError) throw updateError
    if (updated?.length) return {text: decidedText(updated[0], mode)}
    // Параллельно решили в другом нажатии — показываем то, что записалось.
    const {data: fresh} = await supabase.from('instagram_campaigns').select('*').eq('id', campaignId).maybeSingle()
    return {text: decidedText(fresh ?? campaign, mode)}
}

/** Текст сообщения администратору по состоянию кампании. */
export const decidedText = (campaign: {status: string, title?: string | null, permalink?: string | null}, mode = igCommentsMode()): string => {
    const link = campaign.permalink ?? ''
    if (campaign.status === 'ignored') return `🚫 Reel не участвует в «СОХРАНИТЬ»\n${link}`
    if (campaign.status === 'completed') return `🏁 «СОХРАНИТЬ» по «${campaign.title ?? 'Reel'}» завершено\n${link}`
    if (campaign.status === 'active') return `✅ «СОХРАНИТЬ» включено: «${campaign.title}»\n${link}\n` + (mode === 'send'
        ? 'Комментарии, оставленные раньше, тоже получат ответ (если им меньше 7 дней).'
        : 'Режим log: комментарии записываются без Direct. После включения send ответ получат только новые комментарии.')
    return `📸 Reel ждёт решения\n${link}`
}

import {Markup} from 'telegraf'
import {IG_CAMPAIGN} from '#server/bot/callbacks/routes'
import {ADMIN_TELEGRAM_ID} from '#server/global/oneLinkApp'
import {listRecentMedia, graphFailureText} from '#server/global/engine/instagram/comments/graph'
import {
    captionMediaType, captionTitles, igCommentsMode, parseTmdbReference, pickSearchResults, rankCandidates, REPLY_WINDOW_MS,
    type Candidate, type JobForMatch
} from '#server/global/engine/instagram/comments/plan'
import {tmdbGet} from '#server/global/engine/collections/tmdb'
import type {IgMediaType} from '#server/global/engine/instagram/comments/messages'

/**
 * Кампании «СОХРАНИТЬ»: Reel ↔ фильм. Reels выкладываются вручную (reelTarget = telegram_manual),
 * id Reel в задаче нет — таймер находит новые Reels аккаунта сам и спрашивает администратора,
 * тот ли это фильм: «Да» / «Нет». Вариант — ролик бота с похожей подписью (reel_processing_jobs), а если Reel
 * собран мимо бота — название в кавычках из подписи, найденное в TMDB. Нет ответа 5 минут — включается само
 * (решение владельца 23.11: «СОХРАНИТЬ» работает под каждым Reel). Ответ на вопрос названием или ссылкой TMDB
 * привязывает Reel к этому фильму (и исправляет неверный).
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

const REPLY_HINT = 'Не тот фильм — ответьте на это сообщение названием или ссылкой TMDB.'

const candidateNote = (candidate: Candidate) => {
    const parts = [candidate.mediaType === 'tv' ? 'сериал' : 'фильм', candidate.year].filter(Boolean)
    return candidate.source === 'search' || candidate.source === 'manual' ? ` (${parts.join(', ')}, по TMDB)` : ''
}

/** TMDB search/multi по названию (ru-RU) → до трёх вариантов; сбой TMDB — пусто (спросим администратора). */
export const searchCandidates = async (query: string, preferType: IgMediaType | null = null): Promise<Candidate[]> => {
    try {
        const data = await tmdbGet<{results?: any[]}>(`search/multi?query=${encodeURIComponent(query)}&language=ru-RU&include_adult=false&page=1`)
        return pickSearchResults(data.results ?? [], preferType)
    } catch (error: any) {
        console.warn('[IG CAMPAIGN] поиск в TMDB не удался', error?.message ?? error)
        return []
    }
}

/** Reel собран мимо бота: ищем в TMDB названия в кавычках из подписи. */
const candidatesFromCaption = async (caption: string | null | undefined): Promise<Candidate[]> => {
    for (const title of captionTitles(caption)) {
        const found = await searchCandidates(title, captionMediaType(caption))
        if (found.length) return found
    }
    return []
}

/** Через сколько без ответа администратора кампания включается сама. */
export const AUTO_APPROVE_MS = 5 * 60_000

export const campaignAdminText = (campaign: Pick<CampaignRow, 'permalink' | 'published_at' | 'candidates'>, mode = igCommentsMode()): string => {
    const when = campaign.published_at ? new Date(campaign.published_at).toLocaleString('ru-RU', {timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'}) : ''
    const candidate = campaign.candidates[0]
    return [
        `📸 Новый Reel в Instagram${when ? ` (${when})` : ''}`,
        ...(campaign.permalink ? [campaign.permalink] : []),
        '',
        candidate
            ? `Это «${candidate.title}»${candidateNote(candidate)}? ${candidate.source ? 'Без ответа через 5 минут «СОХРАНИТЬ» включится само.' : ''}${mode === 'log' ? ' (Режим log: комментарии только записываются.)' : ''}`.trimEnd()
            : 'Фильм по подписи не нашёлся.',
        candidate ? REPLY_HINT : 'Ответьте на это сообщение названием фильма или ссылкой TMDB — «СОХРАНИТЬ» включится с ним.'
    ].join('\n')
}

/** «Да» — лучший вариант фильма (choice 0), «Нет» — Reel без «СОХРАНИТЬ». */
export const campaignAdminKeyboard = (campaign: Pick<CampaignRow, 'id' | 'candidates'>) => Markup.inlineKeyboard([[
    ...(campaign.candidates.length ? [Markup.button.callback('✅ Да', IG_CAMPAIGN.encode({campaignId: campaign.id, choice: 0}))] : []),
    Markup.button.callback('🚫 Нет', IG_CAMPAIGN.encode({campaignId: campaign.id, choice: 'n'}))
]])

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
            const matched = rankCandidates(reel, jobs, job => (job as any).title)
            const candidates = matched.length ? matched : await candidatesFromCaption(reel.caption)
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

/**
 * Нет ответа администратора AUTO_APPROVE_MS после вопроса — кампания включается с лучшим вариантом фильма.
 * Время вопроса — updated_at (askAdmin ставит его вместе с admin_message_id). Без вариантов фильма не включаем.
 * Условное обновление из pending: параллельное нажатие «Нет» или второй тик не включат дважды.
 */
export const autoApproveCampaigns = async (supabase: any, telegram: any, now: Date, mode = igCommentsMode()): Promise<number> => {
    const {data, error} = await supabase.from('instagram_campaigns')
        .select('id,permalink,candidates,admin_message_id')
        .eq('status', 'pending').gt('admin_message_id', 0)
        .lt('updated_at', new Date(now.getTime() - AUTO_APPROVE_MS).toISOString())
        .limit(50)
    if (error) throw error
    let approved = 0
    for (const campaign of data ?? []) {
        const candidate = (campaign.candidates as Candidate[] | null)?.[0]
        if (!candidate?.source) continue
        const nowIso = now.toISOString()
        const {data: updated, error: updateError} = await supabase.from('instagram_campaigns')
            .update({status: 'active', media_id: candidate.mediaId, media_type: candidate.mediaType, title: candidate.title, next_poll_at: nowIso, updated_at: nowIso})
            .eq('id', campaign.id).eq('status', 'pending').select('id,status,title,permalink')
        if (updateError) throw updateError
        if (!updated?.length) continue
        approved++
        await telegram.editMessageText(ADMIN_TELEGRAM_ID, campaign.admin_message_id, undefined, decidedText(updated[0], mode, {auto: true}), {
            link_preview_options: {is_disabled: true}
        }).catch((error: any) => console.warn('[IG CAMPAIGN] сообщение администратору не обновлено', error?.response?.description ?? error?.message ?? error))
    }
    return approved
}

/** Итог вместо вопроса — одной строкой и ссылкой. */
export const decidedText = (campaign: {status: string, title?: string | null, permalink?: string | null}, mode = igCommentsMode(), {auto = false}: {auto?: boolean} = {}): string => {
    const link = campaign.permalink ?? ''
    if (campaign.status === 'ignored') return `🚫 Без «СОХРАНИТЬ»\n${link}`
    if (campaign.status === 'completed') return `🏁 «СОХРАНИТЬ» по «${campaign.title ?? 'Reel'}» завершено\n${link}`
    if (campaign.status === 'active') return `✅ «${campaign.title}» — «СОХРАНИТЬ» включено${auto ? ' (без ответа за 5 минут)' : ''}${mode === 'log' ? ', режим log' : ''}\n${link}\n${REPLY_HINT}`
    return `📸 Reel ждёт решения\n${link}`
}

export type LinkByReplyResult = {reply: string, questionText?: string}

/**
 * Ответ администратора на вопрос о Reel (reply на сообщение бота): ссылка/номер TMDB или название.
 * Привязывает Reel к фильму и включает «СОХРАНИТЬ» — из «ждёт», «без СОХРАНИТЬ» и включённой (исправить фильм).
 * null — сообщение не про кампанию (ответ на другое сообщение бота).
 */
export const linkCampaignByReply = async (supabase: any, adminMessageId: number, text: string, mode = igCommentsMode()): Promise<LinkByReplyResult | null> => {
    const {data: campaign, error} = await supabase.from('instagram_campaigns').select('id,status,permalink,next_poll_at')
        .eq('admin_message_id', adminMessageId).maybeSingle()
    if (error) throw error
    if (!campaign) return null
    if (campaign.status === 'completed') return {reply: '🏁 Кампания по этому Reel уже завершена (прошло 30 дней) — привязывать поздно.'}

    let candidate: Candidate | null = null
    const reference = parseTmdbReference(text)
    if (reference) {
        try {
            const media = await tmdbGet<any>(`${reference.mediaType}/${reference.mediaId}?language=ru-RU`)
            candidate = {
                ...reference, title: String(media.title || media.name || `${reference.mediaType} ${reference.mediaId}`),
                year: String(media.release_date || media.first_air_date || '').slice(0, 4) || null, source: 'manual'
            }
        } catch {
            return {reply: `Не нашёл в TMDB ${reference.mediaType === 'tv' ? 'сериал' : 'фильм'} с номером ${reference.mediaId}. Проверьте ссылку.`}
        }
    } else {
        const found = await searchCandidates(text.trim())
        if (found[0]) candidate = {...found[0], source: 'manual'}
    }
    if (!candidate) return {reply: `Не нашёл «${text.trim().slice(0, 60)}» в TMDB. Пришлите ссылку вида themoviedb.org/movie/12345.`}

    const nowIso = new Date().toISOString()
    const {data: updated, error: updateError} = await supabase.from('instagram_campaigns').update({
        status: 'active', media_id: candidate.mediaId, media_type: candidate.mediaType, title: candidate.title,
        candidates: [candidate], next_poll_at: campaign.status === 'active' ? campaign.next_poll_at : nowIso, updated_at: nowIso
    }).eq('id', campaign.id).neq('status', 'completed').select('id,status,title,permalink')
    if (updateError) throw updateError
    if (!updated?.length) return {reply: '🏁 Кампания по этому Reel уже завершена — привязывать поздно.'}
    const note = candidateNote(candidate)
    return {
        reply: `✅ Reel привязан к «${candidate.title}»${note} — «СОХРАНИТЬ» включено.${reference ? '' : ' Если не тот — пришлите ссылку TMDB.'}`,
        questionText: decidedText(updated[0], mode)
    }
}

import {Markup} from 'telegraf'
import {ADMIN_STATUS, ADMIN_STATUS_QUEUE_CANCEL, ADMIN_STATUS_REEL_CANCEL} from '#server/bot/callbacks/routes'
import {isAdmin} from '#server/bot/consts/admins'
import {BUNDLES} from '#server/global/engine/collections/bundles'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {humanReelError} from '#server/global/engine/instagram/reel/jobs/reelProgress'
import {youtubeQueueConfig} from '#server/global/engine/youtube/config'
import {parseTrailerTitle} from '#server/global/engine/youtube/matchTmdbMedia'
import {currentSlot, formatSlot, nextSlotAt} from '#server/global/engine/youtube/schedule'

/**
 * /status — панель администратора (запрос владельца 20.11): что сейчас идёт — Reels, очередь
 * автопубликации YouTube, судья связок. Под панелью: «✖️ N» — убрать ролик N из очереди,
 * «🗑 Снять» — снять зависший Reel, «🔄 Обновить». Всё в одном сообщении.
 */

const ACTIVE_REEL_STATUSES = ['queued', 'processing', 'awaiting_review', 'ready', 'publishing']
// Задачи очереди YouTube: source_update_id от этого числа (youtubeQueue.ts).
const QUEUE_SOURCE_UPDATE_OFFSET = 1_000_000_000_000
const DAY_MS = 24 * 60 * 60_000
const QUEUE_SHOWN = 5

type Button = ReturnType<typeof Markup.button.callback>
type Section = {lines: string[], rows?: Button[][]}

const escapeHtml = (value: unknown) =>
    String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const clock = (date: Date) => date.toLocaleTimeString('ru-RU', {timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit'})

const ago = (iso: string | null | undefined, now: number) => {
    const minutes = Math.max(0, Math.round((now - Date.parse(String(iso))) / 60_000))
    return minutes < 60 ? `${minutes} мин` : minutes < 48 * 60 ? `${Math.floor(minutes / 60)} ч ${minutes % 60} мин` : `${Math.floor(minutes / 1440)} дн`
}

const shorten = (text: string, max = 32) => text.length > max ? `${text.slice(0, max - 1)}…` : text

const reelTitle = (job: any) => {
    const media = job.input_payload?.session?.media
    return media?.title || media?.name || job.input_payload?.content?.title || `${job.media_type} ${job.media_id}`
}

/** Задача старше суток в работе не бывает: воркер или финализатор не дошли до конца. */
const isStuck = (job: any, now: number) => now - Date.parse(job.created_at) > DAY_MS

const reelState = (job: any): string => {
    if (job.status === 'awaiting_review') {
        return job.step === 'fragment_choice' ? '👀 ждёт выбора фрагмента'
            : job.step === 'hook_choice' ? '👀 ждёт выбора хука'
                : '👀 ждёт проверки clean'
    }
    return ({
        queued: '⏳ ждёт запуска воркера',
        processing: `⚙️ воркер работает${job.worker_phase ? ` (${job.worker_phase})` : ''}`,
        ready: '📦 собран, ждёт публикации',
        publishing: '🚀 публикуется'
    } as Record<string, string>)[job.status] ?? job.status
}

const failedLine = (error: {message: string}) => `⚠️ не удалось прочитать: ${escapeHtml(error.message)}`

const reelsSection = async (supabase: any, now: number): Promise<Section> => {
    const [{data: active, error}, {data: recent}] = await Promise.all([
        supabase.from('reel_processing_jobs')
            .select('id,status,step,worker_phase,media_type,media_id,input_payload,source_update_id,created_at')
            .in('status', ACTIVE_REEL_STATUSES).order('created_at', {ascending: true}).limit(10),
        supabase.from('reel_processing_jobs')
            .select('status,step,input_payload,media_type,media_id,last_error')
            .gte('updated_at', new Date(now - DAY_MS).toISOString())
            .or('step.eq.published,step.eq.published_manual,step.eq.published_telegram_only,status.eq.failed')
            .order('updated_at', {ascending: false}).limit(50)
    ])
    const lines = ['🎬 <b>Reels</b>']
    if (error) return {lines: [...lines, failedLine(error)]}

    if (!active?.length) lines.push('Сейчас ничего не собирается.')
    for (const job of active ?? []) {
        const auto = Number(job.source_update_id) >= QUEUE_SOURCE_UPDATE_OFFSET ? ' · авто' : ''
        const state = isStuck(job, now) ? '🧟 завис' : reelState(job)
        lines.push(`${state} — «${escapeHtml(reelTitle(job))}» · ${ago(job.created_at, now)}${auto}`)
    }

    const published = (recent ?? []).filter((job: any) => job.step === 'published').length
    const manual = (recent ?? []).filter((job: any) => job.step === 'published_manual').length
    // Отменённые администратором — не сбой.
    const withoutReel = (recent ?? []).filter((job: any) => !['published', 'published_manual', 'cancelled'].includes(job.step))
    if (published || manual || withoutReel.length) {
        lines.push(`<i>За сутки: в Instagram ${published}, в бот для ручной загрузки ${manual}, без Reel ${withoutReel.length}</i>`)
    }
    const lastFailure = withoutReel.find((job: any) => job.last_error)
    if (lastFailure) {
        lines.push(`<i>Последний сбой: «${escapeHtml(reelTitle(lastFailure))}» — ${escapeHtml(humanReelError(lastFailure.last_error))}</i>`)
    }

    const stuck = (active ?? []).filter((job: any) => isStuck(job, now))
    return {
        lines,
        rows: stuck.map((job: any) => [Markup.button.callback(`🗑 Снять «${shorten(reelTitle(job), 28)}»`, ADMIN_STATUS_REEL_CANCEL.encode({jobId: job.id}))])
    }
}

/** Короткое название ролика: тайтл TMDB или название из заголовка без «| Official Trailer | Netflix». */
const queueName = (item: any) => {
    const parsed = parseTrailerTitle(String(item.title ?? ''))
    const season = String(item.title ?? '').match(/\bseason\s+(\d+)/i)?.[1]
    return `${item.tmdb_title || parsed?.name || item.title}${season ? ` · сезон ${season}` : ''}`
}

const queueSection = async (supabase: any, now: number): Promise<Section> => {
    const config = youtubeQueueConfig()
    const priority = new Set(config.channels.filter(channel => channel.priority).map(channel => channel.id))
    const [{data: queued, error}, {data: lastJob}, {count: skippedToday}] = await Promise.all([
        supabase.from('youtube_publish_queue')
            .select('id,video_id,channel_id,channel_name,title,tmdb_title,video_published_at,not_before,status')
            .in('status', ['queued', 'dispatching']).limit(200),
        // Как в youtubeQueue.ts: последняя задача очереди с запущенным воркером — занят ли текущий слот.
        supabase.from('reel_processing_jobs').select('created_at')
            .gte('source_update_id', QUEUE_SOURCE_UPDATE_OFFSET).not('worker_execution_name', 'is', null)
            .order('created_at', {ascending: false}).limit(1).maybeSingle(),
        supabase.from('youtube_publish_queue').select('id', {count: 'exact', head: true})
            .in('status', ['skipped', 'failed']).gte('updated_at', new Date(now - DAY_MS).toISOString())
    ])
    const lines = [`▶️ <b>Очередь YouTube</b> · ${config.enabled ? `в ${config.slots.map(formatSlot).join(' · ')}` : 'выключена'}`]
    if (error) return {lines: [...lines, failedLine(error)]}

    // Порядок выдачи как в claim_youtube_queue_item: приоритетные каналы, затем от старых к новым.
    const items = [...(queued ?? [])].sort((a: any, b: any) =>
        Number(priority.has(b.channel_id)) - Number(priority.has(a.channel_id)) ||
        Date.parse(a.video_published_at ?? '9999') - Date.parse(b.video_published_at ?? '9999'))
    const shown = items.slice(0, QUEUE_SHOWN)
    if (!items.length) {
        lines.push('Очередь пуста.')
    } else {
        // Слот идёт и в нём ещё не публиковали — сейчас, иначе следующий слот.
        const slot = currentSlot(new Date(now), config.slots)
        const next = slot && !(lastJob && Date.parse(lastJob.created_at) >= slot.start.getTime())
            ? new Date(now)
            : nextSlotAt(new Date(now), config.slots)
        const russian = items.filter((item: any) => priority.has(item.channel_id)).length
        lines.push(`В очереди ${items.length}${russian ? `, русских ${russian}` : ''} · следующая ≈ ${clock(next)}`)
        shown.forEach((item: any, index: number) => {
            const later = item.not_before && Date.parse(item.not_before) > now ? ` · не раньше ${clock(new Date(item.not_before))}` : ''
            const busy = item.status === 'dispatching' ? ' · запускается' : ''
            const flag = priority.has(item.channel_id) ? '🇷🇺 ' : ''
            const link = `<a href="https://youtu.be/${escapeHtml(item.video_id)}">${escapeHtml(queueName(item))}</a>`
            lines.push(`${index + 1}. ${flag}${link} · <i>${escapeHtml(item.channel_name ?? '')}</i>${later}${busy}`)
        })
        if (items.length > QUEUE_SHOWN) lines.push(`<i>… и ещё ${items.length - QUEUE_SHOWN}</i>`)
    }
    if (skippedToday) lines.push(`<i>Пропущено за сутки: ${skippedToday}</i>`)

    // «✖️ N» — убрать ролик из очереди; тот, что уже запускается, не трогаем.
    const cancellable = shown.map((item: any, index: number) => ({item, index})).filter(({item}) => item.status === 'queued')
    return {
        lines,
        rows: cancellable.length
            ? [cancellable.map(({item, index}) => Markup.button.callback(`✖️ ${index + 1}`, ADMIN_STATUS_QUEUE_CANCEL.encode({queueId: Number(item.id)})))]
            : []
    }
}

/** Запуски workflow в GitHub Actions: в работе и в очереди (нет токена или сбой — undefined). */
const githubRuns = async (workflow: string): Promise<{running: number, queued: number} | undefined> => {
    const token = process.env.GITHUB_ACTIONS_TOKEN?.trim()
    if (!token) return undefined
    const repo = process.env.GITHUB_ACTIONS_REPO?.trim() || 'vlad3eko/SeeLaterTelegram'
    const count = async (status: string) => {
        const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?status=${status}&per_page=1`, {
            headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'collections-bot'},
            signal: AbortSignal.timeout(10_000)
        })
        if (!response.ok) throw new Error(`GitHub ${response.status}`)
        return Number((await response.json() as {total_count?: number}).total_count ?? 0)
    }
    try {
        const [running, queued] = await Promise.all([count('in_progress'), count('queued')])
        return {running, queued}
    } catch {
        return undefined
    }
}

const bundlesSection = async (supabase: any, now: number): Promise<Section> => {
    const [{data: runs, error}, actions, covers] = await Promise.all([
        supabase.from('collection_bundle_runs').select('bundle_key,status,stats,started_at,finished_at,created_at')
            .order('created_at', {ascending: false}).limit(5),
        githubRuns('collection-bundles.yml'),
        githubRuns('collection-covers.yml')
    ])
    const lines = ['🧩 <b>Связки</b>']
    if (error) return {lines: [...lines, failedLine(error)]}

    const name = (key: string) => {
        const bundle = BUNDLES.find(item => item.key === key)
        return bundle ? `${bundle.emoji} «${escapeHtml(bundle.title)}»` : escapeHtml(key)
    }
    const running = (runs ?? []).filter((run: any) => run.status === 'running' || run.status === 'queued')
    for (const run of running) lines.push(`⚙️ ${name(run.bundle_key)} — судья считает · ${ago(run.started_at ?? run.created_at, now)}`)
    const actionsBusy = Boolean(actions?.running || actions?.queued)
    // Запуск уже идёт, но до первой связки ещё не дошёл (установка зависимостей).
    if (actionsBusy && !running.length) lines.push(`⚙️ Запуск в GitHub Actions: в работе ${actions!.running}, в очереди ${actions!.queued}`)
    if (!running.length && !actionsBusy) {
        const last = (runs ?? []).find((run: any) => run.status === 'done' || run.status === 'failed')
        const result = (run: any) => run.status === 'failed' ? 'ошибка'
            : run.stats?.publishable === false ? 'контроль провален' : `в подборке ${run.stats?.ready ?? 0}`
        lines.push(last
            ? `Сейчас не считается. <i>Последняя: ${name(last.bundle_key)} — ${result(last)}, ${ago(last.finished_at, now)} назад</i>`
            : 'Сейчас не считается.')
    }
    if (covers?.running || covers?.queued) lines.push(`🖼 Рисуются обложки /g: в работе ${covers.running}, в очереди ${covers.queued}`)
    return {lines}
}

export const buildAdminStatus = async (now = Date.now()) => {
    const supabase = getSupabase() as any
    const sections = await Promise.all([reelsSection(supabase, now), queueSection(supabase, now), bundlesSection(supabase, now)])
    return {
        text: [`📊 <b>Что сейчас происходит</b> · ${clock(new Date(now))}`, ...sections.map(section => section.lines.join('\n'))].join('\n\n'),
        keyboard: Markup.inlineKeyboard([
            ...sections.flatMap(section => section.rows ?? []),
            [Markup.button.callback('🔄 Обновить', ADMIN_STATUS.encode())]
        ]).reply_markup
    }
}

const statusMessage = async () => {
    const {text, keyboard} = await buildAdminStatus()
    return {text, extra: {parse_mode: 'HTML' as const, reply_markup: keyboard, link_preview_options: {is_disabled: true}}}
}

const redraw = async (ctx: any) => {
    const {text, extra} = await statusMessage()
    await ctx.editMessageText(text, extra).catch((error: any) => {
        if (!String(error?.response?.description ?? '').includes('not modified')) {
            console.warn('[ADMIN STATUS]', error?.response?.description ?? error)
        }
    })
}

/** /status: только администратору; остальным команда не отвечает. */
export const adminStatusCommand = async (ctx: any) => {
    if (!isAdmin(ctx.from?.id)) return
    const {text, extra} = await statusMessage()
    await ctx.reply(text, extra)
}

export const adminStatusRefresh = async (ctx: any) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery().catch(() => undefined)
    await ctx.answerCbQuery('Обновляю…').catch(() => undefined)
    await redraw(ctx)
}

/** «✖️ N»: ролик уходит из очереди (skipped). Тот, что уже запускается, не трогаем. */
export const adminStatusQueueCancel = async (ctx: any) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery().catch(() => undefined)
    const {queueId} = ADMIN_STATUS_QUEUE_CANCEL.parse(ctx)
    const {data, error} = await (getSupabase() as any).from('youtube_publish_queue')
        .update({status: 'skipped', last_error: 'убран из очереди администратором', finished_at: new Date().toISOString()})
        .eq('id', queueId).eq('status', 'queued')
        .select('title,tmdb_title')
    const removed = data?.[0]
    await ctx.answerCbQuery(error ? 'Не получилось — попробуйте ещё раз'
        : removed ? `Убрал из очереди: ${shorten(queueName(removed), 60)}` : 'Ролик уже не в очереди').catch(() => undefined)
    await redraw(ctx)
}

/** «🗑 Снять»: зависший Reel (старше суток) отмечается отменённым, как кнопка «Отменить» в проверке. */
export const adminStatusReelCancel = async (ctx: any) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery().catch(() => undefined)
    const {jobId} = ADMIN_STATUS_REEL_CANCEL.parse(ctx)
    const {data, error} = await (getSupabase() as any).from('reel_processing_jobs')
        .update({status: 'failed', step: 'cancelled', last_error: 'Отменено администратором', failed_at: new Date().toISOString(), lease_token: null, lease_expires_at: null})
        .eq('id', jobId).in('status', ACTIVE_REEL_STATUSES).lt('created_at', new Date(Date.now() - DAY_MS).toISOString())
        .select('id')
    await ctx.answerCbQuery(error ? 'Не получилось — попробуйте ещё раз' : data?.length ? 'Снял' : 'Задача уже не висит').catch(() => undefined)
    await redraw(ctx)
}

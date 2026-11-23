import {matchesKeyword} from '#server/global/engine/instagram/comments/keyword'
import type {IgComment} from '#server/global/engine/instagram/comments/graph'
import type {IgMediaType} from '#server/global/engine/instagram/comments/messages'

/** Чистые решения таймера Instagram «СОХРАНИТЬ» — без сети и базы, покрыты тестами. */

const HOUR = 3600_000
const DAY = 24 * HOUR

/** Private Reply Meta принимает до 7 дней после комментария. */
export const REPLY_WINDOW_MS = 7 * DAY
/** Повторное чтение последних 15 минут: комментарий мог появиться между страницами. */
export const OVERLAP_MS = 15 * 60_000

export type Candidate = {mediaId: number, mediaType: IgMediaType, title: string}
export type JobForMatch = {media_id: number, media_type: IgMediaType, instagram_caption: string | null, published_at: string | null, title?: string | null}

const words = (text: string | null | undefined) =>
    new Set(String(text ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(word => word.length > 2))

/** Доля слов подписи Reel, совпавших с подготовленной подписью задачи (0…1). */
export const captionSimilarity = (reelCaption: string | null | undefined, jobCaption: string | null | undefined): number => {
    const reel = words(reelCaption), job = words(jobCaption)
    if (!reel.size || !job.size) return 0
    let common = 0
    for (const word of reel) if (job.has(word)) common++
    return common / Math.min(reel.size, job.size)
}

/**
 * Варианты фильма для нового Reel: задачи, опубликованные за 3 дня до Reel, по похожести подписи,
 * при равенстве — ближе по времени. До трёх, без повторов фильма.
 */
export const rankCandidates = (reel: {caption?: string | null, timestamp: string}, jobs: JobForMatch[], titleOf: (job: JobForMatch) => string): Candidate[] => {
    const reelAt = Date.parse(reel.timestamp)
    const scored = jobs
        .filter(job => job.published_at && Math.abs(reelAt - Date.parse(job.published_at)) <= 3 * DAY)
        .map(job => ({job, score: captionSimilarity(reel.caption, job.instagram_caption), distance: Math.abs(reelAt - Date.parse(job.published_at!))}))
        .sort((a, b) => b.score - a.score || a.distance - b.distance)
    const seen = new Set<string>()
    const result: Candidate[] = []
    for (const {job} of scored) {
        const key = `${job.media_type}:${job.media_id}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push({mediaId: Number(job.media_id), mediaType: job.media_type, title: titleOf(job)})
        if (result.length === 3) break
    }
    return result
}

/**
 * Сколько опрашивать Reel. Окно Private Reply (7 дней) считается от КОММЕНТАРИЯ, а Reels смотрят неделями —
 * поэтому опрос дольше окна; комментарий старше 7 дней на момент чтения всё равно станет expired.
 */
export const POLL_MS = 30 * DAY

/**
 * Когда опрашивать снова: 5 минут первые 7 дней (ответ любому — не позже чем через 5 минут, решение владельца 23.11),
 * 2 часа до 30 дней; дальше кампания закрыта (null). Вебхук Meta, когда приходит, опрашивает Reel сразу.
 */
/**
 * Расписание опроса — в запусках таймера (Scheduler каждые 2 минуты, ровно в чётные минуты). Срок ставится на 30 с
 * раньше нужного запуска: проход заканчивается через несколько секунд, и с ровным интервалом Reel попадал бы
 * только в следующий запуск. Почти все комментарии — в первые двое суток, поэтому свежие Reels чаще.
 *
 * Бюджет (замер 23.11): лимит Instagram Graph API — «4800 × показы аккаунта» за скользящие 24 ч; 150 запросов
 * опроса заняли ≈1 % процессорного времени, т. е. ≈15 000 запросов в сутки при нынешнем охвате. Худший день
 * (4 свежих Reels + 4 до недели, поиск Reels раз в 10 мин) ≈ 4 300 запросов — до 30 %. Охват падает — лимит
 * тоже; поэтому тормоз по заголовку X-Business-Use-Case-Usage: от USAGE_SLOW % — редкий режим, от USAGE_STOP % опрос
 * ждёт (Direct уходят: у Private Reply свой лимит 750 в час).
 */
export const TICK_MS = 2 * 60_000
const EARLY_MS = 30_000
const FRESH_MS = 2 * DAY
export const USAGE_SLOW = 50
export const USAGE_STOP = 85

const ticks = (count: number) => count * TICK_MS - EARLY_MS

/** Когда опрашивать снова: до 2 суток — каждый запуск (2 мин), до 7 дней — через запуск (4 мин), до 30 дней — 2 ч; дальше null. */
export const nextPollAt = (publishedAt: string | null, now: Date, {slow = false}: {slow?: boolean} = {}): Date | null => {
    const age = now.getTime() - (publishedAt ? Date.parse(publishedAt) : now.getTime())
    if (age >= POLL_MS) return null
    const interval = age < FRESH_MS ? ticks(slow ? 3 : 1) : age < REPLY_WINDOW_MS ? ticks(slow ? 5 : 2) : ticks(60)
    return new Date(now.getTime() + interval)
}

/**
 * Статусы записи, при которых человеку ответ под этим Reel уже ушёл или уходит. Следующий его комментарий
 * с ключом — duplicate. Остальные (send_failed, expired, logged, duplicate) ответа не дали — новый комментарий
 * получает свой ответ (решение владельца 23.11: повторно отвечаем, если прежний ответ не ушёл).
 */
export const REPLIED_STATUSES = ['queued', 'sending', 'sent', 'send_unknown', 'started', 'saved', 'already_saved', 'auto_saved'] as const

/** До какого времени листать комментарии: последний увиденный минус перекрытие, иначе публикация Reel. */
export const commentsCutoff = (lastSeenAt: string | null, publishedAt: string | null, now: Date): number => {
    if (lastSeenAt) return Date.parse(lastSeenAt) - OVERLAP_MS
    return publishedAt ? Date.parse(publishedAt) - OVERLAP_MS : now.getTime() - REPLY_WINDOW_MS
}

export type LeadDraft = {comment_id: string, commenter_id: string | null, commented_at: string, status: 'queued' | 'logged' | 'duplicate' | 'expired'}

/**
 * Комментарии → новые записи. Без ключевого слова и свои — пропускаются (в базу не пишем).
 * Один ответ на человека под Reel: следующий его комментарий с ключом — duplicate (knownCommenters — только
 * те, кому ответ ушёл, см. REPLIED_STATUSES). Старше 7 дней — expired (Meta уже не примет ответ).
 * Режим log: вместо queued — logged (только для просмотра; после включения send ответ получат лишь новые
 * комментарии, а не все за прошедшие дни — решение владельца 23.11).
 */
export const draftLeads = (comments: IgComment[], {account, knownCommenters, now, keywords, mode = 'send'}: {account: string, knownCommenters: Set<string>, now: Date, keywords?: readonly string[], mode?: 'log' | 'send'}): LeadDraft[] => {
    const commenters = new Set(knownCommenters)
    const drafts: LeadDraft[] = []
    const chronological = [...comments].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    for (const comment of chronological) {
        const commenter = comment.from?.id ?? null
        if (commenter === account || !matchesKeyword(comment.text, keywords)) continue
        const base = {comment_id: comment.id, commenter_id: commenter, commented_at: new Date(comment.timestamp).toISOString()}
        if (now.getTime() - Date.parse(comment.timestamp) >= REPLY_WINDOW_MS) drafts.push({...base, status: 'expired'})
        else if (commenter && commenters.has(commenter)) drafts.push({...base, status: 'duplicate'})
        else if (mode === 'log') drafts.push({...base, status: 'logged'})
        else drafts.push({...base, status: 'queued'})
        if (commenter && mode === 'send') commenters.add(commenter)
    }
    return drafts
}

/** Самый свежий комментарий в выборке — новая отметка «прочитано до». */
export const newestTimestamp = (comments: IgComment[], previous: string | null): string | null => {
    const newest = Math.max(...comments.map(comment => Date.parse(comment.timestamp)), previous ? Date.parse(previous) : 0)
    return newest > 0 ? new Date(newest).toISOString() : previous
}

/** Режим из INSTAGRAM_COMMENTS: off (по умолчанию) — ничего; log — ищем и записываем без Direct; send — полностью. */
export type IgCommentsMode = 'off' | 'log' | 'send'
export const igCommentsMode = (value = process.env.INSTAGRAM_COMMENTS): IgCommentsMode =>
    value === 'send' || value === 'log' ? value : 'off'

/** Ответ под комментарием выключается отдельно: INSTAGRAM_COMMENT_REPLY=off. */
export const igCommentReplyEnabled = (value = process.env.INSTAGRAM_COMMENT_REPLY): boolean => value !== 'off'

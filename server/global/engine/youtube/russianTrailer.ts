import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {findExcludedTitleReason, isRussianAudio, youtubeQueueConfig, type WatchedChannel} from '#server/global/engine/youtube/config'
import {normalize, parseTrailerTitle, titleMatch, yearOf} from '#server/global/engine/youtube/matchTmdbMedia'

/**
 * Русский трейлер (дубляж или озвучка) тайтла с русских каналов слежения — то, что владелец
 * делал вручную: «Редактировать → Изменить ключ трейлера», ссылка на русский ролик (решение
 * владельца 20.11). Ключ трейлера в TMDB часто английский, хотя дубляж уже вышел.
 *
 *   1. Таблица очереди: туда записывается каждый ролик лент каналов, в том числе пропущенные —
 *      бесплатно, хватает для свежих фильмов.
 *   2. Только для «Опубликовать» (search) и если в таблице нет: поиск YouTube «<название> русский
 *      трейлер», как владелец ищет сам (YOUTUBE_API_KEY, 100 единиц квоты из 10 000 в день).
 *      Найденные ролики русских каналов записываются в таблицу — следующий раз без поиска.
 *
 * Ролик подходит, если очередь уже сопоставила его с этим тайтлом (media_id) или название
 * совпадает с названием TMDB (год ±2); найденному поиском хватает оригинального названия в
 * описании (в TMDB бывает нет русского: «The Nightingale» — ролик «Соловей»). «Субтитры» не
 * берутся: для них публикуется оригинал со своими субтитрами.
 */

const TABLE = 'youtube_publish_queue'
const SELECT = 'video_id,title,media_id,media_type,video_published_at'

type Row = {video_id: string, title: string, media_id: number | null, media_type: string | null, video_published_at: string | null}
type Found = Row & {channel_id: string, description: string}

/** Самое длинное слово названия как шаблон ilike (е и ё — любая буква): отбор кандидатов в базе. */
const keywordPattern = (title: string) => {
    const word = [...title.matchAll(/[\p{L}\d]{4,}/gu)].map(match => match[0]).sort((a, b) => b.length - a.length)[0]
    return word ? `%${word.replace(/[её]/gi, '_')}%` : undefined
}

const yearFits = (videoYear: number | undefined, media: Record<string, any>) => {
    const year = yearOf(media)
    return !videoYear || !year || Math.abs(videoYear - year) <= 2
}

export const isRussianTrailerFor = (row: Row & {description?: string}, media: Record<string, any>, mediaType: string, mediaId: number) => {
    if (!isRussianAudio(row.title) || findExcludedTitleReason(row.title)) return false
    if (Number(row.media_id) === mediaId && row.media_type === mediaType) return true
    const parsed = parseTrailerTitle(row.title)
    if (!parsed) return false
    // Сезон — только к сериалу; у фильма год из ролика близок к году премьеры.
    if (mediaType !== 'tv' && parsed.isSeason) return false
    if (mediaType !== 'tv' && !yearFits(parsed.year, media)) return false
    if (titleMatch(parsed.name, media)) return true
    // Оригинальное название в описании ролика (только у найденных поиском).
    const original = normalize(media.original_title || media.original_name)
    return Boolean(row.description && original.length >= 4 && ` ${normalize(row.description)} `.includes(` ${original} `))
}

const newest = <T extends Row>(rows: T[]) =>
    [...rows].sort((a, b) => (Date.parse(b.video_published_at ?? '') || 0) - (Date.parse(a.video_published_at ?? '') || 0))[0]

const fromTable = async (channels: string[], media: Record<string, any>, mediaType: string, mediaId: number) => {
    const supabase = getSupabase()
    const pattern = keywordPattern(String(media.title || media.name || ''))
    const table = () => supabase.from(TABLE).select(SELECT).in('channel_id', channels)
    const [byId, byName] = await Promise.all([
        table().eq('media_id', mediaId).eq('media_type', mediaType).limit(20),
        pattern ? table().ilike('title', pattern).order('video_published_at', {ascending: false}).limit(50) : {data: [], error: null}
    ])
    if (byId.error || byName.error) throw new Error((byId.error ?? byName.error)!.message)
    return newest([...(byId.data ?? []), ...(byName.data ?? [])].filter(row => isRussianTrailerFor(row as Row, media, mediaType, mediaId)))
}

const decodeHtml = (value: string) => value
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const fromSearch = async (channels: WatchedChannel[], media: Record<string, any>, mediaType: string, mediaId: number, apiKey: string) => {
    const params = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        maxResults: '50',
        relevanceLanguage: 'ru',
        q: `${media.title || media.name} русский трейлер`,
        key: apiKey
    })
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, {signal: AbortSignal.timeout(20_000)})
    if (!response.ok) throw new Error(`YouTube search HTTP ${response.status}`)
    const body = await response.json() as {items?: Array<{id?: {videoId?: string}, snippet?: Record<string, any>}>}

    const ours: Found[] = (body.items ?? []).flatMap(item => {
        const channel = channels.find(watched => watched.id === item.snippet?.channelId)
        return channel && item.id?.videoId ? [{
            video_id: item.id.videoId,
            title: decodeHtml(String(item.snippet?.title ?? '')),
            description: decodeHtml(String(item.snippet?.description ?? '')),
            channel_id: channel.id,
            media_id: null,
            media_type: null,
            video_published_at: item.snippet?.publishedAt ?? null
        }] : []
    })
    const matching = ours.filter(row => isRussianTrailerFor(row, media, mediaType, mediaId))

    // Кэш: все ролики русских каналов из выдачи — в таблицу (уже известные не трогаются), подходящие
    // этому тайтлу — с его media_id, чтобы следующий раз найтись без поиска.
    if (ours.length) {
        const {error} = await getSupabase().from(TABLE).upsert(ours.map(row => ({
            channel_id: row.channel_id,
            channel_name: channels.find(channel => channel.id === row.channel_id)?.name ?? null,
            video_id: row.video_id,
            title: row.title,
            video_published_at: row.video_published_at,
            status: 'skipped',
            last_error: 'найден поиском YouTube для «Опубликовать»',
            ...(matching.includes(row) ? {media_id: mediaId, media_type: mediaType, tmdb_title: media.title || media.name || null} : {})
        })), {onConflict: 'video_id', ignoreDuplicates: true})
        if (error) console.error('[RUSSIAN TRAILER CACHE ERROR]', error.message)
    }
    return newest(matching)
}

/**
 * Самый свежий русский трейлер тайтла или undefined. search — искать в YouTube, если в таблице нет
 * (только «Опубликовать»: в автопубликации свежий дубляж и так приходит с каналов слежения).
 * Ошибка — undefined: публикация идёт с ключом TMDB.
 */
export const findRussianTrailer = async (
    media: Record<string, any>,
    mediaType: string,
    mediaId: number,
    {search = false, apiKey = process.env.YOUTUBE_API_KEY?.trim()}: {search?: boolean, apiKey?: string} = {}
) => {
    const channels = youtubeQueueConfig().channels.filter(channel => channel.priority)
    if (!channels.length) return undefined
    try {
        const best = await fromTable(channels.map(channel => channel.id), media, mediaType, mediaId) ??
            (search && apiKey ? await fromSearch(channels, media, mediaType, mediaId, apiKey) : undefined)
        return best ? {videoId: String(best.video_id), title: String(best.title)} : undefined
    } catch (error) {
        console.error('[RUSSIAN TRAILER LOOKUP ERROR]', error instanceof Error ? error.message : error)
        return undefined
    }
}

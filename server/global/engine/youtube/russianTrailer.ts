import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {findExcludedTitleReason, isRussianAudio, youtubeQueueConfig} from '#server/global/engine/youtube/config'
import {parseTrailerTitle, titleMatch, yearOf} from '#server/global/engine/youtube/matchTmdbMedia'

/**
 * Русский трейлер (дубляж или озвучка) тайтла с русских каналов слежения — то, что владелец
 * делал вручную: «Редактировать → Изменить ключ трейлера», ссылка на русский ролик (решение
 * владельца 20.11). Ключ трейлера в TMDB часто английский, хотя дубляж уже вышел.
 *
 * Ищется в таблице очереди: туда записывается каждый ролик лент каналов, в том числе
 * пропущенные, — запросов к YouTube и TMDB нет. Ролик подходит, если очередь уже сопоставила
 * его с этим тайтлом (media_id) или его название совпадает с названием TMDB (год ±2). Ролики
 * с «Субтитрами» не берутся: для них публикуется оригинал со своими субтитрами.
 */

const SELECT = 'video_id,title,media_id,media_type,video_published_at'

type Row = {video_id: string, title: string, media_id: number | null, media_type: string | null, video_published_at: string | null}

/** Самое длинное слово названия как шаблон ilike (е и ё — любая буква): отбор кандидатов в базе. */
const keywordPattern = (title: string) => {
    const word = [...title.matchAll(/[\p{L}\d]{4,}/gu)].map(match => match[0]).sort((a, b) => b.length - a.length)[0]
    return word ? `%${word.replace(/[её]/gi, '_')}%` : undefined
}

export const isRussianTrailerFor = (row: Row, media: Record<string, any>, mediaType: string, mediaId: number) => {
    if (!isRussianAudio(row.title) || findExcludedTitleReason(row.title)) return false
    if (Number(row.media_id) === mediaId && row.media_type === mediaType) return true
    const parsed = parseTrailerTitle(row.title)
    if (!parsed || !titleMatch(parsed.name, media)) return false
    // Сезон — только к сериалу; у фильма год из ролика близок к году премьеры.
    if (mediaType === 'tv') return true
    if (parsed.isSeason) return false
    const year = yearOf(media)
    return !parsed.year || !year || Math.abs(parsed.year - year) <= 2
}

/** Самый свежий русский трейлер тайтла или undefined. Ошибка базы — undefined (публикация идёт с ключом TMDB). */
export const findRussianTrailer = async (media: Record<string, any>, mediaType: string, mediaId: number) => {
    const channels = youtubeQueueConfig().channels.filter(channel => channel.priority).map(channel => channel.id)
    const pattern = keywordPattern(String(media.title || media.name || ''))
    if (!channels.length) return undefined

    try {
        const supabase = getSupabase()
        const table = () => supabase.from('youtube_publish_queue').select(SELECT).in('channel_id', channels)
        const [byId, byName] = await Promise.all([
            table().eq('media_id', mediaId).eq('media_type', mediaType).limit(20),
            pattern ? table().ilike('title', pattern).order('video_published_at', {ascending: false}).limit(50) : {data: [], error: null}
        ])
        if (byId.error || byName.error) throw new Error((byId.error ?? byName.error)!.message)

        const best = [...(byId.data ?? []), ...(byName.data ?? [])]
            .filter(row => isRussianTrailerFor(row as Row, media, mediaType, mediaId))
            .sort((a, b) => Date.parse(b.video_published_at ?? '') - Date.parse(a.video_published_at ?? '') || 0)[0]
        return best ? {videoId: String(best.video_id), title: String(best.title)} : undefined
    } catch (error) {
        console.error('[RUSSIAN TRAILER LOOKUP ERROR]', error instanceof Error ? error.message : error)
        return undefined
    }
}

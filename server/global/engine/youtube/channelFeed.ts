import {execFile} from 'node:child_process'
import {existsSync} from 'node:fs'
import path from 'node:path'
import {promisify} from 'node:util'
import {getYtDlpPath} from '#server/global/engine/instagram/scripts-yt-bgutil/ytDlp'

const execFileAsync = promisify(execFile)

export type ChannelVideo = {
    videoId: string
    title: string
    /** Время публикации на YouTube; у источника yt-dlp его нет. */
    publishedAt?: string
}

/** Сколько последних роликов канала смотреть за один раз. */
const LATEST_COUNT = 15

/** Ролик из ответа источника или ничего (без id или названия) — для flatMap. */
const toVideo = (videoId: unknown, title: unknown, publishedAt?: string): ChannelVideo[] => {
    const name = String(title ?? '').trim()
    return typeof videoId === 'string' && /^[0-9A-Za-z_-]{11}$/.test(videoId) && name
        ? [{videoId, title: name, ...(publishedAt ? {publishedAt} : {})}]
        : []
}

/** YouTube Data API v3: плейлист загрузок канала (UU…), 1 единица квоты за запрос. */
const fromDataApi = async (channelId: string, apiKey: string): Promise<ChannelVideo[]> => {
    const params = new URLSearchParams({
        part: 'snippet',
        maxResults: String(LATEST_COUNT),
        playlistId: `UU${channelId.slice(2)}`,
        key: apiKey
    })
    const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`, {
        signal: AbortSignal.timeout(20_000)
    })
    if (!response.ok) {
        throw new Error(`YouTube Data API HTTP ${response.status}`)
    }
    const body = await response.json() as {items?: Array<{snippet?: Record<string, any>}>}

    return (body.items ?? []).flatMap(item =>
        toVideo(item.snippet?.resourceId?.videoId, item.snippet?.title, item.snippet?.publishedAt))
}

const decodeXml = (value: string) =>
    value
        .replace(/&quot;/g, '"')
        .replace(/&apos;|&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')

/** RSS-лента канала: без ключа, но у YouTube бывают долгие периоды 404/500. */
const fromRss = async (channelId: string): Promise<ChannelVideo[]> => {
    const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
        signal: AbortSignal.timeout(20_000)
    })
    if (!response.ok) {
        throw new Error(`RSS HTTP ${response.status}`)
    }
    const xml = await response.text()

    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].flatMap(([, entry]) => toVideo(
        entry!.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1],
        decodeXml(entry!.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''),
        entry!.match(/<published>([^<]+)<\/published>/)?.[1]
    ))
}

const ytDlpBinary = (): string => {
    try {
        return getYtDlpPath()
    } catch (error) {
        // Локальная разработка на Windows: бинарник ставит npm run reel:setup-ytdlp.
        const local = path.join(process.cwd(), 'tmp', 'tools', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
        if (existsSync(local)) return local
        throw error
    }
}

/** yt-dlp: список роликов вкладки «Видео» без скачивания (несколько секунд). */
const fromYtDlp = async (channelId: string): Promise<ChannelVideo[]> => {
    const {stdout} = await execFileAsync(
        ytDlpBinary(),
        [
            '--flat-playlist',
            '--dump-single-json',
            '--playlist-items', `1:${LATEST_COUNT}`,
            '--no-warnings',
            '--encoding', 'utf-8',
            `https://www.youtube.com/channel/${channelId}/videos`
        ],
        {timeout: 90_000, maxBuffer: 20 * 1024 * 1024, encoding: 'utf8'}
    )
    const playlist = JSON.parse(stdout) as {entries?: Array<Record<string, any>>}

    return (playlist.entries ?? []).flatMap(entry => toVideo(
        entry.id,
        entry.title,
        entry.timestamp ? new Date(Number(entry.timestamp) * 1000).toISOString() : undefined
    ))
}

/**
 * Последние ролики канала, новые первыми. Источники по очереди: Data API (если задан ключ),
 * RSS, yt-dlp. Первый непустой ответ возвращается; если не ответил ни один — ошибка.
 */
export const listChannelVideos = async (
    channelId: string,
    {apiKey}: {apiKey?: string} = {}
): Promise<{videos: ChannelVideo[], source: string}> => {
    const sources: Array<[string, () => Promise<ChannelVideo[]>]> = [
        ...(apiKey ? [['data-api', () => fromDataApi(channelId, apiKey)] as [string, () => Promise<ChannelVideo[]>]] : []),
        ['rss', () => fromRss(channelId)],
        ['yt-dlp', () => fromYtDlp(channelId)]
    ]
    const errors: string[] = []

    for (const [source, load] of sources) {
        try {
            const videos = await load()
            if (videos.length) return {videos, source}
            errors.push(`${source}: empty`)
        } catch (error) {
            errors.push(`${source}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
        }
    }

    throw new Error(`[YOUTUBE FEED] ${channelId}: ${errors.join('; ')}`)
}

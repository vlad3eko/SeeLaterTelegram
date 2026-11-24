import type {TmdbMovieDetails} from "~/types/tmdb.types";
import {tmdbFetch} from "#server/utils/api/tmdbFetch";

export type MediaBrief = {
    title: string
    overview: string
    type: string
    genres: string
}

/*
 * Краткая информация о тайтле для всплывающих панелей («i» на постере, название в «Лучших работах»
 * у человека): грузится один раз при первом открытии из /api/tmdb/media (кэшируется на сервере).
 */
export const useMediaBrief = (media: () => { id?: number, tmdb_id?: number, media_type?: string, title?: string, name?: string }) => {
    const brief = ref<MediaBrief | null>(null)
    const failed = ref(false)

    const load = async () => {
        if (brief.value) return
        const item = media()
        const mediaId = item.tmdb_id || item.id
        const mediaType = item.media_type
        if (!mediaId || (mediaType !== 'movie' && mediaType !== 'tv')) return

        failed.value = false
        try {
            const data = await tmdbFetch<TmdbMovieDetails>('/api/tmdb/media', {query: {id: mediaId, media: mediaType}})
            if (!data) return
            brief.value = {
                title: item.title || item.name || 'Без названия',
                overview: data.overview || 'Описание отсутствует',
                type: mediaType === 'tv' ? 'Сериал' : 'Фильм',
                genres: data.genres?.map(genre => genre.name).join(', ') || 'Жанры отсутствуют',
            }
        } catch (error) {
            failed.value = true
            console.error('useMediaBrief error:', error)
        }
    }

    return {brief, failed, load}
}

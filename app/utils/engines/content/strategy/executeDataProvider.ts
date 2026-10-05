import {ContentStrategy} from "~/utils/engines/content/strategy/enums"
import {fetchPages} from "~/utils/engines/content/helpers/fetchPages"
import {engineRichListCard} from "#server/global/engine/card/engineRichListCard"
import type {queryRichCard} from "#server/global/engine/card/enum/types"

const getToday = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}
const getDateWithoutTime = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const getWeekRange = (offset: number) => {
    const today = getDateWithoutTime(new Date())
    const day = today.getDay()
    const diffToMonday = day === 0 ? 6 : day - 1
    const monday = new Date(today)
    monday.setDate(monday.getDate() - diffToMonday + offset * 7)
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    const format = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }
    return {
        from: format(monday),
        to: format(sunday)
    }
}
const sortWeekRange = (collectedData: any, from: any, to: any) => {
    return collectedData
        .filter((item: any) => (isMovie(item) || isTv(item)))
        .filter((item: any) => {
            const date = getReleaseDate(item)
            return date >= from && date <= to
        })
        .sort(byPopularity)
        .slice(0, 15)
}
const getMonthRange = () => {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const format = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }
    return {
        from: format(from),
        to: format(to)
    }
}
const getReleaseDate = (item: any) => item.release_date || item.first_air_date || ''
const isMovie = (item: any) => item.media_type === 'movie'
const isTv = (item: any) => item.media_type === 'tv'
const isReleased = (item: any) => {
    const releaseDate = getReleaseDate(item)
    if (!releaseDate) return false
    return releaseDate <= getToday()
}
const isUpcoming = (item: any) => {
    const releaseDate = getReleaseDate(item)
    if (!releaseDate) return false
    return releaseDate > getToday()
}
const byPopularity = (a: any, b: any) => (b.popularity || 0) - (a.popularity || 0)
const byRating = (a: any, b: any) => {
    const ratingDiff = (b.vote_average || 0) - (a.vote_average || 0)
    if (ratingDiff !== 0) return ratingDiff
    return (b.vote_count || 0) - (a.vote_count || 0)
}
const byReleaseDateAsc = (a: any, b: any) => getReleaseDate(a).localeCompare(getReleaseDate(b))
const toQuery = (item: any): queryRichCard => ({
    id: item.id,
    type: item.media_type === 'tv' ? 'tv' : 'movie',
    contentType: item.content_type,
    status: 'ready'
})
const toQueries = (items: any[]): queryRichCard[] => items.map(toQuery)
const hasGenre = (item: any, genreId: number) => Array.isArray(item.genre_ids) && item.genre_ids.includes(genreId)
const getActorId = (ctx: any) => Number(ctx.state?.actorId || ctx.state?.personId || 0)
const getGenreId = (ctx: any) => Number(ctx.state?.genreId || 0)
const getReferenceMediaId = (ctx: any) => Number(ctx.state?.mediaId || 0)
const getTitle = (item: any) => String(item.title || item.name || item.original_title || item.original_name || '').toLowerCase()


export const executeDataProvider = async (ctx: any, strategy: string, userId: number) => {
    const fetchPageNum = 20
    const collectedData = await fetchPages(userId, fetchPageNum)

    if (!Array.isArray(collectedData)) {
        return ctx.reply('Не удалось получить данные для рекомендации.')
    }

    switch (strategy) {

        case ContentStrategy.WHAT_WATCH_TODAY: {

            const items = collectedData
                .filter((item: any) => (isMovie(item) || isTv(item)) && isReleased(item))
                .filter((item: any) => Number(item.vote_count || 0) >= 50)
                .sort(byPopularity)
                .slice(0, 15)
            return engineRichListCard(ctx, toQueries(items))
        }

        case ContentStrategy.RELEASE_THIS_MONTH: {

            const { from, to } = getMonthRange()
            const items = collectedData
                .filter((item: any) => (isMovie(item) || isTv(item)))
                .filter((item: any) => {
                    const date = getReleaseDate(item)
                    return date >= from && date <= to
                })
                .sort((a: any, b: any) => {
                    const dateDiff = getReleaseDate(a).localeCompare(getReleaseDate(b))
                    if (dateDiff !== 0) return dateDiff
                    return byPopularity(a, b)
                })
                .slice(0, 15)
            return engineRichListCard(ctx, toQueries(items))
        }

        case ContentStrategy.RELEASE_TODAY: {

            const today = getToday()
            const items = collectedData
                .filter((item: any) => (isMovie(item) || isTv(item)))
                .filter((item: any) => getReleaseDate(item) === today)
                .sort(byPopularity)
                .slice(0, 15)
            return engineRichListCard(ctx, toQueries(items))
        }

        case ContentStrategy.RELEASE_LAST_WEEK: {

            const { from, to } = getWeekRange(-1)
            const items = sortWeekRange(collectedData, from, to)
            return engineRichListCard(ctx, toQueries(items))
        }

        case ContentStrategy.RELEASE_NEXT_WEEK: {

            const { from, to } = getWeekRange(1)
            const items = sortWeekRange(collectedData, from, to)
            return engineRichListCard(ctx, toQueries(items))
        }

        case ContentStrategy.MOST_WAITING_MOVIE: {

            const items = collectedData
                .filter(isMovie)
                .filter(isUpcoming)
                .filter((item: any) => Number(item.popularity || 0) > 0)
                .sort((a: any, b: any) => {
                    const popularityDiff = byPopularity(a, b)
                    if (popularityDiff !== 0) return popularityDiff
                    const ratingDiff = byRating(a, b)
                    if (ratingDiff !== 0) return ratingDiff
                    return byReleaseDateAsc(a, b)
                })
                .slice(0, 15)
            return engineRichListCard(ctx, toQueries(items))
        }

        case ContentStrategy.MOST_WAITING_SERIES: {

            const items = collectedData
                .filter(isTv)
                .filter(isUpcoming)
                .filter((item: any) => Number(item.popularity || 0) > 0)
                .sort((a: any, b: any) => {
                    const popularityDiff = byPopularity(a, b)
                    if (popularityDiff !== 0) return popularityDiff
                    return byRating(a, b)
                })
                .slice(0, 15)
            return engineRichListCard(ctx, toQueries(items))
        }

        case ContentStrategy.MOST_WAITING_CARTOON: {

            const items = collectedData
                .filter((item: any) => (isMovie(item) || isTv(item)))
                .filter(isUpcoming)
                .filter((item: any) => hasGenre(item, 16))
                .sort((a: any, b: any) => {
                    const popularityDiff = byPopularity(a, b)
                    if (popularityDiff !== 0) return popularityDiff
                    return byRating(a, b)
                })
                .slice(0, 15)
            return engineRichListCard(ctx, toQueries(items))
        }

        case ContentStrategy.BEST_MOVIES_BY_ACTOR: {

            const actorId = getActorId(ctx)
            let items = collectedData.filter(isMovie)
            if (actorId) {
                items = items.filter((item: any) => {
                    const cast = item.credits?.cast || item.cast || []
                    return cast.some((person: any) => Number(person.id) === actorId)
                })
            }
            items = items
                .filter((item: any) => Number(item.vote_count || 0) >= 50)
                .sort(byRating)
                .slice(0, 15)
            return engineRichListCard(ctx, toQueries(items))
        }

        case ContentStrategy.BEST_MOVIES_BY_GENRE: {

            let genreId = getGenreId(ctx)
            if (!genreId) {
                const genreCounter = new Map<number, number>()
                for (const item of collectedData) {
                    if (!isMovie(item) || !Array.isArray(item.genre_ids)) {
                        continue
                    }
                    for (const id of item.genre_ids) {
                        genreCounter.set(id, (genreCounter.get(id) || 0) + 1)
                    }
                }
                genreId = [...genreCounter.entries()].sort((a, b) => b[1] - a[1]).at(0)?.[0] || 0
            }
            const items = collectedData
                .filter(isMovie)
                .filter((item: any) => genreId && hasGenre(item, genreId))
                .filter((item: any) => Number(item.vote_count || 0) >= 50)
                .sort(byRating)
                .slice(0, 15)
            return engineRichListCard(ctx, toQueries(items))
        }

        case ContentStrategy.LOOKALIKE_AT_MEDIA_NAME: {

            const referenceMediaId = getReferenceMediaId(ctx)
            let reference = collectedData.find((item: any) => Number(item.id) === referenceMediaId)
            if (!reference) {
                reference = [...collectedData].sort(byPopularity).at(0)
            }
            if (!reference) {
                return engineRichListCard(ctx, [])
            }
            const referenceGenres = Array.isArray(reference.genre_ids) ? reference.genre_ids : []
            const referenceType = reference.media_type
            const referenceId = reference.id
            const items = collectedData
                .filter((item: any) => item.id !== referenceId)
                .filter((item: any) => (item.media_type === referenceType))
                .map((item: any) => {
                    const genres = Array.isArray(item.genre_ids) ? item.genre_ids : []
                    const genreMatches = genres.filter((genreId: number) => referenceGenres.includes(genreId)).length
                    return { item, genreMatches }
                })
                .sort((a: any, b: any) => {
                    const genreDiff = b.genreMatches - a.genreMatches
                    if (genreDiff !== 0) return genreDiff
                    return byPopularity(a.item, b.item)
                })
                .map((entry: any) => entry.item)
                .slice(0, 15)
            return engineRichListCard(ctx, toQueries(items))
        }

        default:
            return ctx.reply(`Неизвестная ContentStrategy: ${strategy}`)
    }
}

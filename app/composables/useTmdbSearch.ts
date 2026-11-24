// userId = 0: у сайта нет telegram id — история поиска бота не пишется.
import {engineSearch} from "#server/global/engine/search/engineSearch";

const itemKey = (item: any) => `${item.media_type}-${item.id}`

export const useTmdbSearch = () => {

    const searchInput = ref("")
    const movies = ref<any[]>([])
    const page = ref(1)
    const totalPages = ref(1)
    const pending = ref(false)

    // Номер текущего поиска: ответ устаревшего запроса (пользователь уже ищет другое) отбрасывается.
    let searchId = 0
    let lastQuery = ''

    const appendUnique = (items: any[]) => {
        const seen = new Set(movies.value.map(itemKey))
        for (const item of items || []) {
            const key = itemKey(item)
            if (seen.has(key)) continue
            seen.add(key)
            movies.value.push(item)
        }
    }

    const searchMovies = async () => {
        const query = searchInput.value.trim()

        const id = ++searchId

        // Новый поиск всегда заменяет прежнюю выдачу.
        movies.value = []
        page.value = 1
        totalPages.value = 1
        lastQuery = query

        if (!query) {
            pending.value = false
            return
        }

        pending.value = true

        try {
            const result: any = await engineSearch(query, 1, 0)

            if (id !== searchId) return

            appendUnique(result?.results || [])
            totalPages.value = result?.total_pages || 1
        } catch (error) {
            console.error('[WEB SEARCH ERROR]', error)
        } finally {
            if (id === searchId) pending.value = false
        }
    }

    const loadMore = async () => {

        if (pending.value || !lastQuery) return
        if (page.value >= totalPages.value) return

        const id = searchId
        pending.value = true

        try {
            const nextPage = page.value + 1
            const result: any = await engineSearch(lastQuery, nextPage, 0)

            if (id !== searchId) return

            page.value = nextPage
            appendUnique(result?.results || [])
        } catch (error) {
            console.error('[WEB SEARCH MORE ERROR]', error)
        } finally {
            if (id === searchId) pending.value = false
        }
    }

    return {
        movies,
        pending,
        searchInput,
        searchMovies,
        loadMore,
        page,
        totalPages
    }
}

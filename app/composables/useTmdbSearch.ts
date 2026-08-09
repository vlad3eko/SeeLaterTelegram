import { searchMedia } from "~/utils/engines/search/searchMedia";

export const useTmdbSearch = () => {

    const searchInput = ref("")
    const movies = ref<any[]>([])
    const page = ref(1)
    const totalPages = ref(1)
    const pending = ref(false)

    const searchMovies = async () => {
        if (!searchInput.value.trim()) {
            movies.value = []
            return
        }

        pending.value = true

        try {

            page.value = 1

            const result:any = await searchMedia(
                searchInput.value,
                page.value
            )

            const newResults =
                result.results.filter(
                    (item:any)=>
                        !movies.value.some(
                            old =>
                                old.id === item.id &&
                                old.media_type === item.media_type
                        )
                )


            movies.value.push(...newResults)
            totalPages.value =
                result.total_pages || 1

        } finally {
            pending.value = false
        }
    }

    const loadMore = async () => {

        if (pending.value)
            return

        if (page.value >= totalPages.value)
            return

        pending.value = true

        try {

            page.value++

            const result:any = await searchMedia(
                searchInput.value,
                page.value
            )

            movies.value.push(
                ...(result.results || [])
            )

        } finally {
            pending.value = false
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

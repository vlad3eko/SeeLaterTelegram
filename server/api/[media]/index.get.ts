
import {serverSupabaseServiceRole} from "#supabase/server";
import {getSessionUser} from "#server/utils/api/sessionUser";

// Telegram отдаёт не больше 50 inline-результатов на страницу.
const MAX_LIMIT = 50
// Колонки, по которым разрешена сортировка (bookmarks.vue и бот).
const SORT_COLUMNS = new Set(['created_at', 'vote_count', 'release_date'])

export default defineEventHandler(async (event) => {
    const query = getQuery(event)

    // Пагинация: получаем текущую страницу page и лимит элементов limit
    const page = Math.max(1, parseInt(query.page as string) || 1)
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit as string) || 20))

    // ИСПРАВЛЕНО: Вычисляем границы диапазона для Supabase .range()
    const from = (page - 1) * limit
    const to = (page * limit) - 1

    const sortBy = typeof query.sortBy === 'string' && SORT_COLUMNS.has(query.sortBy)
        ? query.sortBy
        : 'created_at'
    const supabase = serverSupabaseServiceRole(event)

    let user: { id: number } | null = null

    if (event.context.isInternal) {
        // Вызов бота (с внутренним секретом): избранное по telegram_id из запроса.
        const userId = typeof query.userId === 'number' || typeof query.userId === 'string' ? query.userId : null

        if (!userId) return {results: [], nextPage: null}

        const {data} = await supabase
            .from('users')
            .select('id')
            .eq('telegram_id', userId)
            .maybeSingle()

        user = data
    } else {
        // Публичный вызов (сайт): только избранное того, кто вошёл. userId из запроса игнорируется,
        // иначе по чужому id можно было бы читать чужие закладки.
        user = await getSessionUser(event)
    }

    if (!user) return {results: [], nextPage: null}

    // Запрос с пагинацией через новые границы диапазона from и to
    const {data, count} = await supabase
        .from('favorites')
        .select('*', {count: 'exact'})
        .eq('user_id', user.id)
        .order(sortBy, {ascending: false})
        .range(from, to) // Теперь передаем корректный срез

    const totalItems = count || 0
    const total_pages = Math.ceil(totalItems / limit)

    // Вычисляем, есть ли следующая страница (номер следующей страницы или null)

    return {
        page,
        results: data || [],
        total_pages // Возвращаем nextPage вместо nextOffset для фронтенда/бота
    }
})

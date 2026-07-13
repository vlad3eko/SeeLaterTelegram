import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)

    // Пагинация: получаем текущую страницу page и лимит элементов limit
    const page = parseInt(query.page as string) || 1
    const limit = parseInt(query.limit as string) || 20

    // ИСПРАВЛЕНО: Вычисляем границы диапазона для Supabase .range()
    const from = (page - 1) * limit
    const to = (page * limit) - 1

    const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'created_at'
    const userId = typeof query.userId === 'number' || typeof query.userId === 'string' ? query.userId : null

    if (!userId) return {results: [], nextPage: null}

    const supabase = await serverSupabaseClient(event)

    const {data: user} = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', userId)
        .maybeSingle()

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

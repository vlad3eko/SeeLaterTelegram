import { serverSupabaseClient } from "#supabase/server";

export default defineEventHandler(async (event) => {
    const query = getQuery(event)

    // Пагинация: получаем текущий offset (смещение) и limit (размер страницы)
    const offset = parseInt(query.offset as string) || 0
    const limit = parseInt(query.limit as string) || 20

    const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'created_at'
    const userId = typeof query.userId === 'number' || typeof query.userId === 'string' ? query.userId : null

    if (!userId) return { results: [], nextOffset: null }

    const supabase = await serverSupabaseClient(event)

    const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', userId)
        .maybeSingle()

    if (!user) return { results: [], nextOffset: null }

    // Запрос с пагинацией через .range()
    const { data, count } = await supabase
        .from('favorites')
        .select('*', { count: 'exact' }) // count: 'exact' вернет общее число записей в базе
        .eq('user_id', user.id)
        .order(sortBy, { ascending: false })
        .range(offset, offset + limit - 1) // Запрашиваем с элемента X по элемент Y

    // Вычисляем, есть ли следующая страница
    const nextOffset = count && (offset + limit < count) ? offset + limit : null

    return {
        results: data || [],
        nextOffset // Отдаем фронтенду/боту информацию, откуда брать следующую страницу
    }
})

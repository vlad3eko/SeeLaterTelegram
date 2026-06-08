import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const sortBy =
        typeof query.sortBy === 'string'
            ? query.sortBy
            : 'created_at'

    const supabase = await serverSupabaseClient(event)

    const {data, error} = await supabase
        .from('favorites')
        .select()
        .order(sortBy,
            {
                ascending: false
            }
        )

    return {
        data,
        error
    }
})

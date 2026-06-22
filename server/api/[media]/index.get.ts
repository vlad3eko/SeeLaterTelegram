import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const sortBy = query.sortBy


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

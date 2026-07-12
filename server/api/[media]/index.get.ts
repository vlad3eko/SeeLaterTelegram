import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    // const sortBy =
    //     typeof query.sortBy === 'string'
    //         ? query.sortBy
    //         : 'created_at'

    const userId =
        typeof query.userId === 'number' || 'string'
            ? query.userId
            : null

    console.log('userId inside', userId)

    const supabase = await serverSupabaseClient(event)

    const { data: user } = await supabase
        .from('users')
        .select()
        .eq('id', userId)
        .single()

    const {data, error} = await supabase
        .from('favorites')
        .select()
        .eq('user_id', user.id)
        // .order(sortBy,
        //     {
        //         ascending: false
        //     }
        // )

    console.log('check fetch inside data', data)
    console.log('check fetch inside error', error)

    return {
        data,
        error
    }
})

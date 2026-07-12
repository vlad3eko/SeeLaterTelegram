import {serverSupabaseClient} from "#supabase/server";
import {login} from "telegraf/typings/button";

export default defineEventHandler(async (event) => {

    const query = getQuery(event)

    const sortBy =
        typeof query.sortBy === 'string'
            ? query.sortBy
            : 'created_at'

    const userId =
        typeof query.userId === 'number' || 'string'
            ? query.userId
            : null

    const supabase = await serverSupabaseClient(event)

    const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', userId)
        .single()

    const {data, error} = await supabase
        .from('favorites')
        .select()
        .eq('user_id', user.id)
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

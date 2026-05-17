import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler (async (event) => {

    const query = getQuery(event)

    const supabase = await serverSupabaseClient(event)

    const {data, error} = await supabase
        .from('movies')
        .select()
        .eq('id', query.id)
        .single()

    return {data, error}
})

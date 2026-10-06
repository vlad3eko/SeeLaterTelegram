import {serverSupabaseClient} from "#supabase/server";
import {deleteFavorite} from "#server/bot/services/supabase/deleteFavorite";

export default defineEventHandler(async (event) => {

    const supabase =
        await serverSupabaseClient(event)

    const body = await readBody(event)

    const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', body.telegram_id)
        .single()

    const { error, count } = await deleteFavorite(
        supabase,
        user.id,
        body.tmdb_id
    )

    const isSuccess = !error && (count !== null && count > 0);

    return {
        success: isSuccess,
        error: !isSuccess
    }

})

import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const body = await readBody(event)

    const sessionToken = getCookie(
        event,
        'session_token'
    )

    if (!sessionToken) {
        return {
            success: true
        }
    }

    const supabase = await serverSupabaseClient(event)

    await supabase
        .from('sessions')
        .delete()
        .eq('session_token', sessionToken)

    deleteCookie(event, 'session_token')

    return {
        success: true
    }
})

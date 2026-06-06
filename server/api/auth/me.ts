import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {

    const sessionToken = getCookie(
        event,
        'session_token'
    )


    if (!sessionToken) {
        return null
    }
    const supabase = await serverSupabaseClient(event)

    const { data: session } = await supabase
        .from('sessions')
        .select()
        .eq('session_token', sessionToken)
        .single()


    if (!session) {
        return null
    }
    const { data: user } = await supabase
        .from('users')
        .select()
        .eq('id', session.user_id)
        .single()


    if(!user) {
        return null
    }
    return user
})

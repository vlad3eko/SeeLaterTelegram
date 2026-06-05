import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {

    const body = await readBody(event)

    const sessionToken = crypto.randomUUID()

    const supabase = await serverSupabaseClient(event)

    const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', body.telegram_id)
        .single()

    await supabase
        .from('sessions')
        .insert({
            session_token: sessionToken,
            user_id: user.id
        })

    setCookie(event, 'session_token', sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/'
    })

    return {
        success: true
    }
})

import {serverSupabaseClient} from "#supabase/server"

export default defineEventHandler(async(event)=>{

    const supabase = await serverSupabaseClient(event)

    const body = await readBody(event)


    const {data:user,error:userError} = await supabase
        .from('users')
        .select('id')
        .eq(
            'telegram_id',
            body.telegram_id
        )
        .single()


    if(userError) throw userError


    const {data:session,error:sessionError} = await supabase
        .from('users_session')
        .select('message_ids')
        .eq(
            'user_id',
            user.id
        )
        .single()


    if(sessionError) throw sessionError


    const messages = session.message_ids || []


    messages.push({
        inlineMessageId: body.inline_message_id,
        type: body.type
    })


    const {error} = await supabase
        .from('users_session')
        .update({
            message_ids: messages
        })
        .eq(
            'user_id',
            user.id
        )


    if(error) throw error


    return {
        success:true
    }

})

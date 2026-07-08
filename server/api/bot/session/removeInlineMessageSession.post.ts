import {serverSupabaseClient} from "#supabase/server"


export default defineEventHandler(async(event)=>{

    const supabase =
        await serverSupabaseClient(event)


    const body =
        await readBody(event)


    const {data:user,error:userError} =
        await supabase
            .from('users')
            .select('id')
            .eq(
                'telegram_id',
                body.telegram_id
            )
            .single()


    if(userError)
        throw userError



    const {data:session,error} =
        await supabase
            .from('users_session')
            .select('message_ids')
            .eq(
                'user_id',
                user.id
            )
            .single()


    if(error)
        throw error



    const updated =
        (session.message_ids || [])
            .filter(
                (item:any)=>
                    item.inlineMessageId !==
                    body.inline_message_id
            )


    await supabase
        .from('users_session')
        .update({
            message_ids:updated
        })
        .eq(
            'user_id',
            user.id
        )


    return {
        success:true
    }

})

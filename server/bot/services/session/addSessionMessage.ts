export const addSessionMessage = async (telegramId: number, messageId: number, ctx?: any) => {

    console.log('ctx', ctx)
    console.log('ctx.callback_query', ctx.callback_query)
    console.log('ctx.callback_query.message', ctx.callback_query.message)
    console.log('ctx.callback_query.message.message_id', ctx.callback_query.message.message_id)
    if ((!telegramId && !messageId)) {
        console.log('возврат', telegramId + ':', messageId)
    console.log('возврат ctx')
    }
    console.log('прошёл ctx')
    console.log('прошла', telegramId + ':', messageId)
    console.log('telegramId', telegramId)
    console.log('messageId', messageId)

    await $fetch('/api/bot/session/editAddSessionMessage', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            message_id: messageId
        }
    })
}

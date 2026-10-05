export const sendRichMessage = async (
    ctx: any,
    caption: any,
    keyboard?: any
) => {

    if (!ctx?.chat?.id) {
        throw new Error(
            '[sendRichMessage] ctx.chat.id is required'
        )
    }

    const payload: any = {
        chat_id: ctx.chat.id,
        rich_message: caption
    }

    if (keyboard)
        payload.reply_markup = keyboard

    return ctx.telegram.callApi(
        'sendRichMessage',
        payload
    )
}

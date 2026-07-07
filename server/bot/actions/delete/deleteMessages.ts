export async function deleteMessages(ctx: any, offsets: number[]) {

    const chatId = ctx.chat.id;

    const baseMessageId =
        ctx.callbackQuery?.message?.message_id ??
        ctx.message?.message_id;

    if (!baseMessageId) return;

    const messageIds = offsets
        .map(offset => baseMessageId + offset)
        .filter(id => id > 0);

    try {
        await ctx.telegram.deleteMessages(chatId, messageIds);
    } catch (error) {
        console.log("Не удалось удалить сообщения:", error);
    }
}

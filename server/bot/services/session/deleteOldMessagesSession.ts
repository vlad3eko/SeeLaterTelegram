import {internalFetch} from "#server/utils/api/internalFetch";

export const deleteOldMessagesSession = async (telegramId: any) => {
    await internalFetch('/api/bot/session/deleteOldMessagesSession', {
        method: 'POST',
        body: {
            telegram_id: telegramId
        }
    })
}

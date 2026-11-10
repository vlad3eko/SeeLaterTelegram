import {internalFetch} from "#server/utils/api/internalFetch";

export const updateSubscriber = async (telegramId: number, isSubscriber: boolean) => {
    await internalFetch('/api/auth/subscriber', {
        method: 'POST',
        body: {
            telegram_id: telegramId,
            isSubscriber
        }
    })
}

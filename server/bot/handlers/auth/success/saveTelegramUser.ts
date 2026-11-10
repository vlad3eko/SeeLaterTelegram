import {internalFetch} from "#server/utils/api/internalFetch";

export const saveTelegramUser = async (ctx: any) => {
    await internalFetch('/api/auth/telegram', {
        method: 'POST',
        body: {
            telegram_id: ctx.from.id,
            username: ctx.from.username,
            first_name: ctx.from.first_name,
        }
    })
}

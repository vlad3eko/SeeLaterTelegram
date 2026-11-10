import {internalFetch} from "#server/utils/api/internalFetch";

export const confirmUserRequest = async (ctx: any, loginToken: string) => {

    await internalFetch('/api/auth/telegram-confirm', {
        method: 'POST',
        body: {
            token: loginToken,
            telegram_id: ctx.from.id,
        }
    })
}

import {authRequests} from "#server/bot/consts/exportConsts";

export const confirmUserRequest = async (ctx: any) => {

    const loginToken = authRequests.get(ctx.from.id)

    await $fetch('/api/auth/telegram-confirm', {
        method: 'POST',
        body: {
            token: loginToken,
            telegram_id: ctx.from.id,
        }
    })
}

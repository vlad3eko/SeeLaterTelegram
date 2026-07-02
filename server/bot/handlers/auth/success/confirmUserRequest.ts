export const confirmUserRequest = async (ctx: any, loginToken: string) => {

    await $fetch('/api/auth/telegram-confirm', {
        method: 'POST',
        body: {
            token: loginToken,
            telegram_id: ctx.from.id,
        }
    })
}

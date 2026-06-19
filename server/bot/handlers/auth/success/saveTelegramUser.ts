export const saveTelegramUser = async (ctx: any) => {
    await $fetch('/api/auth/telegram', {
        method: 'POST',
        body: {
            telegram_id: ctx.from.id,
            username: ctx.from.username,
            first_name: ctx.from.first_name,
        }
    })
}

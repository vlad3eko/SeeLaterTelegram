export const BOT_ADMINS = [
    788847654
]

export const isAdmin = (telegramId: number) => {
    if (!telegramId) return false

    return BOT_ADMINS.includes(telegramId)
}

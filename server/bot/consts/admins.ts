import {BOT_ADMINS} from "#server/global/oneLinkApp";

export const isAdmin = (telegramId: number) => {
    if (!telegramId) return false

    return BOT_ADMINS.includes(telegramId)
}

import {REQUIRED_CHANNELS, type RequiredChannel} from '#server/global/oneLinkApp'

/**
 * Подписка на все обязательные каналы (REQUIRED_CHANNELS) по Telegram id, без контекста апдейта.
 * Ошибка getChatMember (бот не админ, человек не найден) считается «не подписан».
 */
const MEMBER = new Set(['member', 'administrator', 'creator'])

export const isMemberStatus = (status: string | undefined, isMember?: boolean) =>
    MEMBER.has(status ?? '') || (status === 'restricted' && isMember === true)

export const missingChannels = async (telegram: any, telegramId: number): Promise<RequiredChannel[]> => {
    const checks = await Promise.all(REQUIRED_CHANNELS.map(async channel => {
        try {
            const member = await telegram.getChatMember(channel.chat, telegramId)
            return isMemberStatus(member.status, member.is_member)
        } catch {
            return false
        }
    }))
    return REQUIRED_CHANNELS.filter((_, index) => !checks[index])
}

export const isSubscribedToAll = async (telegram: any, telegramId: number) =>
    (await missingChannels(telegram, telegramId)).length === 0

/** Обязательный канал по username из апдейта (chat.username без @). */
export const requiredChannelByUsername = (username: string | undefined): RequiredChannel | undefined =>
    REQUIRED_CHANNELS.find(channel => channel.chat.slice(1).toLowerCase() === (username ?? '').toLowerCase())

/** Строки списка каналов для просьбы подписаться: отмеченные ✅ уже есть. */
export const channelLines = (missing: readonly RequiredChannel[]) =>
    REQUIRED_CHANNELS.map(channel => `${missing.includes(channel) ? '•' : '✅'} ${channel.title} — ${channel.note}`).join('\n')

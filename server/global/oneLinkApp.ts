export const telegramChannelShortLink = 'https://t.me/kinomanovnet'
export const telegramBotShortLink = 'https://t.me/kinomanovNet_bot'

export const ADMIN_TELEGRAM_ID = 788847654
export const BOT_ADMINS = [ADMIN_TELEGRAM_ID]

export const TELEGRAM_CHANEL_LINK = '@kinomanovnet'
export const TELEGRAM_DEV_CHANEL_LINK = "@dsds12S"

/**
 * Каналы, подписка на которые нужна для бота (кнопки «Сохранить»/«Удалить», кнопки поста в канале,
 * вход на сайт, Instagram «СОХРАНИТЬ»). Бот — администратор обоих: видит участников и получает
 * update chat_member (автопродолжение после подписки, server/bot/handlers/channel/onChannelMember.ts).
 */
export const REQUIRED_CHANNELS = [
    {chat: TELEGRAM_CHANEL_LINK, url: telegramChannelShortLink, title: '🎬 Киноманов', note: 'новые фильмы и сериалы и уведомления о них'},
    {chat: '@Zerno_Kopeica', url: 'https://t.me/Zerno_Kopeica', title: '👨‍💻 Канал разработчика', note: 'как делается бот и что в нём нового'}
] as const

export type RequiredChannel = typeof REQUIRED_CHANNELS[number]



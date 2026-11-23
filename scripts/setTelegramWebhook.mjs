// Регистрирует вебхук Telegram с secret_token. Запускать ДО выкладки нового кода на Vercel:
//
//   node --env-file=.env scripts/setTelegramWebhook.mjs
//
// Адрес вебхука берётся из getWebhookInfo (тот, что уже зарегистрирован). Если нужен другой,
// передайте его первым аргументом. Секрет выводится из TELEGRAM_TOKEN так же, как в
// server/api/bot/webhook.post.ts. Токен и секрет в вывод не попадают.
//
// Старый код на Vercel заголовок игнорирует, поэтому скрипт безопасно запускать до пуша.
// Передаёт allowed_updates с chat_member (подписка на каналы); старый код такие update просто не обрабатывает.
// Повторный запуск безопасен.

import {createHmac} from 'node:crypto'

const SECRET_PURPOSE = 'kinomanov:telegram-webhook:v1'

const token = process.env.TELEGRAM_TOKEN?.trim()

if (!token) {
    console.error('TELEGRAM_TOKEN не задан. Запустите: node --env-file=.env scripts/setTelegramWebhook.mjs')
    process.exit(1)
}

const secret =
    process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
    createHmac('sha256', token).update(SECRET_PURPOSE).digest('hex')

const call = async (method, payload = {}) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(payload),
    })

    return await response.json()
}

const before = await call('getWebhookInfo')

if (!before.ok) {
    console.error('getWebhookInfo не удался:', before.description)
    process.exit(1)
}

const url = process.argv[2] || before.result.url

if (!url) {
    console.error('У этого бота нет зарегистрированного вебхука. Передайте адрес первым аргументом.')
    process.exit(1)
}

console.log('Вебхук сейчас:', before.result.url || '(нет)')
console.log('Ожидает update:', before.result.pending_update_count)
if (before.result.last_error_message) {
    console.log('Последняя ошибка Telegram:', before.result.last_error_message)
}

// Тот же список — BOT_ALLOWED_UPDATES в server/bot/bot.ts. chat_member Telegram шлёт, только если он
// назван явно: по нему бот видит подписку на обязательные каналы (server/bot/handlers/channel/onChannelMember.ts).
const ALLOWED_UPDATES = [
    'message', 'edited_message', 'channel_post', 'edited_channel_post', 'inline_query', 'chosen_inline_result',
    'callback_query', 'my_chat_member', 'chat_member', 'chat_join_request',
]

const payload = {url, secret_token: secret, allowed_updates: ALLOWED_UPDATES}

// Сохраняем прежние настройки подключения.
if (before.result.max_connections) payload.max_connections = before.result.max_connections
if (before.result.ip_address) payload.ip_address = before.result.ip_address

const result = await call('setWebhook', payload)

if (!result.ok) {
    console.error('setWebhook не удался:', result.description)
    process.exit(1)
}

const after = await call('getWebhookInfo')

console.log('Готово. Вебхук:', after.result?.url)
console.log('Разрешённые update:', (after.result?.allowed_updates ?? ['(по умолчанию)']).join(', '))

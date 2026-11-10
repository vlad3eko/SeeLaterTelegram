// Общие правила для запросов входа через Telegram и для веб-сессий.

// Запрос входа живёт недолго: пользователь должен успеть нажать Start в боте.
export const AUTH_REQUEST_TTL_MS = 15 * 60 * 1000

// Серверная сессия сайта. На срок жизни cookie это не влияет (cookie остаётся сессионной).
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Токен входа создаёт браузер (crypto.randomUUID) и передаёт боту через ссылку ?start=<token>.
export const isAuthToken = (value: unknown): value is string =>
    typeof value === 'string' && UUID_PATTERN.test(value)

// Supabase отдаёт timestamp без часового пояса, если колонка `timestamp`, а не `timestamptz`.
// Такие значения хранятся в UTC, поэтому без явного пояса добавляем Z (иначе локальный часовой пояс
// машины сдвинул бы возраст записи на несколько часов).
const parseDbTimestamp = (value: string): number => {
    const hasZone = /(z|[+-]\d{2}(:?\d{2})?)$/i.test(value.trim())
    return Date.parse(hasZone ? value : `${value.trim()}Z`)
}

// Если даты нет или её не удалось разобрать, запись НЕ считается просроченной:
// лучше пропустить, чем сломать вход из-за формата времени.
export const isOlderThan = (createdAt: unknown, ttlMs: number, now: number = Date.now()): boolean => {
    if (typeof createdAt !== 'string' || !createdAt) return false

    const timestamp = parseDbTimestamp(createdAt)
    if (!Number.isFinite(timestamp)) return false

    return now - timestamp > ttlMs
}

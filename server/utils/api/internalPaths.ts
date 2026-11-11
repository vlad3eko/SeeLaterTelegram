// Какие роуты доступны только внутренним вызовам (бот -> API).
// Чистая функция без зависимостей от h3, чтобы её можно было тестировать отдельно.

// Эти роуты под /api/bot/ остаются публичными: у каждого своя проверка.
//  - webhook: секрет Telegram (x-telegram-bot-api-secret-token)
//  - reelJobs/finalize: токен задачи, который приходит из Cloud Run Job
//  - reelJobs/expireReviews: `Authorization: Bearer CRON_SECRET` (таймер проверки Reel)
const PUBLIC_BOT_PATHS = new Set([
    '/api/bot/webhook',
    '/api/bot/reeljobs/finalize',
    '/api/bot/reeljobs/expirereviews',
])

// Роуты вне /api/bot/, которые вызывает только бот.
const INTERNAL_AUTH_PATHS = new Set([
    '/api/auth/telegram-confirm',
    '/api/auth/telegram',
    '/api/auth/subscriber',
])

// Приводим путь к виду, в котором его ни при каких кодировках/слэшах/регистре
// нельзя выдать за другой: сначала декодируем, схлопываем //, убираем . и .., режем хвостовой /.
export const normalizeApiPath = (rawUrl: string): string => {
    let path = String(rawUrl ?? '').split('?')[0]!.split('#')[0]!

    try {
        path = decodeURIComponent(path)
    } catch {
        // Битая кодировка: оставляем как есть, ниже путь всё равно будет проверен.
    }

    const parts: string[] = []
    for (const part of path.replace(/\\/g, '/').split('/')) {
        if (part === '' || part === '.') continue
        if (part === '..') {
            parts.pop()
            continue
        }
        parts.push(part)
    }

    return '/' + parts.join('/').toLowerCase()
}

export const isInternalOnlyPath = (rawUrl: string): boolean => {
    const path = normalizeApiPath(rawUrl)

    if (INTERNAL_AUTH_PATHS.has(path)) return true

    if (path === '/api/bot' || path.startsWith('/api/bot/')) {
        return !PUBLIC_BOT_PATHS.has(path)
    }

    return false
}

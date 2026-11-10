import {tmdbFetch} from "#server/utils/api/tmdbFetch";
import {getInternalSecret, INTERNAL_HEADER} from "#server/utils/api/internalSecret";

// Вызовы закрытых роутов (/api/bot/*, /api/auth/telegram-confirm, ...) должны нести заголовок
// с внутренним секретом. Обёртки полностью повторяют $fetch / tmdbFetch и только добавляют заголовок.

const withInternalHeader = async (options?: any) => {
    const secret = await getInternalSecret()

    if (!secret) return options

    const headers = new Headers(options?.headers)
    headers.set(INTERNAL_HEADER, secret)

    return {...options, headers}
}

// Для мест, где раньше был прямой $fetch('/api/...') (в dev он идёт в локальный сервер).
export const internalFetch = async <T = any>(path: string, options?: any): Promise<T> =>
    await $fetch<T>(path, await withInternalHeader(options)) as T

// Для мест, где раньше был tmdbFetch('/api/...') (в dev он идёт на kinomanov.net).
export const internalTmdbFetch = async <T = any>(path: string, options?: any): Promise<T> =>
    await tmdbFetch<T>(path, await withInternalHeader(options)) as T

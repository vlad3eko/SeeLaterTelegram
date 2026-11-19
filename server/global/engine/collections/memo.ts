/**
 * Кэш в памяти для подборок /g: значение живёт ttlMs, а одинаковые запросы, пришедшие
 * одновременно (счётчики периодов и сборка топа ходят за одними и теми же страницами),
 * ждут один общий ответ, а не уходят во внешний сервис каждый сам. Ошибка не кэшируется.
 */
export const createMemo = <T>({maxEntries = 1000}: {maxEntries?: number} = {}) => {
    const values = new Map<string, {at: number, ttl: number, value: T}>()
    const pending = new Map<string, Promise<T>>()

    const get = async (key: string, ttlMs: number, load: () => Promise<T>): Promise<T> => {
        const cached = values.get(key)
        if (cached && Date.now() - cached.at < cached.ttl) return cached.value
        const running = pending.get(key)
        if (running) return running

        const promise = load().then(value => {
            if (values.size >= maxEntries) values.delete(values.keys().next().value!)
            values.delete(key)
            values.set(key, {at: Date.now(), ttl: ttlMs, value})
            return value
        }).finally(() => pending.delete(key))
        pending.set(key, promise)
        return promise
    }

    return {
        get,
        /** Сбросить (после записи, которая меняет значение; в тестах). */
        clear: () => { values.clear(); pending.clear() }
    }
}

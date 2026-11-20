import {BUNDLES} from '#server/global/engine/collections/bundles'
import type {RunRow} from '#server/global/engine/collections/judge/store'

/**
 * Итог запуска судьи — сообщением администратору (запрос владельца 20.11: понимать, что судья
 * закончил). Шлёт scripts/bundles/runBundles.ts в конце запуска в GitHub Actions.
 */
export const bundleRunSummary = (runs: RunRow[], {error, link}: {error?: string, link?: string} = {}): string => {
    const name = (key: string) => {
        const bundle = BUNDLES.find(item => item.key === key)
        return bundle ? `${bundle.emoji} «${bundle.title}»` : key
    }
    const line = (run: RunRow) => {
        const stats = run.stats as {publishable?: boolean, ready?: number, verdicts?: Record<string, number>}
        if (run.status === 'running' || run.status === 'queued') return `⏳ ${name(run.bundle_key)}: ещё считается`
        if (run.status === 'failed') return `❌ ${name(run.bundle_key)}: ошибка — ${String(run.error ?? '').split('\n')[0]!.slice(0, 200)}`
        const verdicts = stats.verdicts
            ? ` · да ${stats.verdicts.yes ?? 0}, погранично ${stats.verdicts.borderline ?? 0}, нет ${stats.verdicts.no ?? 0}`
            : ''
        return stats.publishable === false
            ? `⚠️ ${name(run.bundle_key)}: контроль провален — подборка не показывается${verdicts}`
            : `✅ ${name(run.bundle_key)}: в подборке ${stats.ready ?? 0}${verdicts}`
    }
    return [
        error ? '🧩 Судья связок остановился с ошибкой' : '🧩 Судья закончил связки',
        ...runs.map(line),
        ...(error ? [`❌ ${error.split('\n')[0]!.slice(0, 300)}`] : []),
        ...(!runs.length && !error ? ['Нечего считать: все связки свежие.'] : []),
        ...(link ? [link] : [])
    ].join('\n')
}

/** Отправить итог администратору; без токена (локальный прогон) — только в лог. */
export const notifyBundleRun = async (text: string, env: NodeJS.ProcessEnv = process.env) => {
    const token = env.TELEGRAM_TOKEN?.trim()
    const chatId = env.BUNDLES_NOTIFY_CHAT_ID?.trim()
    if (!token || !chatId) return console.log(`[BUNDLES] Уведомление не отправлено (нет TELEGRAM_TOKEN или чата):\n${text}`)
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({chat_id: chatId, text, link_preview_options: {is_disabled: true}}),
            signal: AbortSignal.timeout(15_000)
        })
        if (!response.ok) console.warn('[BUNDLES] Уведомление не отправлено', response.status, await response.text())
    } catch (error) {
        console.warn('[BUNDLES] Уведомление не отправлено', error instanceof Error ? error.message : error)
    }
}

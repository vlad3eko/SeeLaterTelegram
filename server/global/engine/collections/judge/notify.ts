import {BUNDLES} from '#server/global/engine/collections/bundles'
import type {RunRow} from '#server/global/engine/collections/judge/store'
import {SHELVES, type ShelfKey} from '#server/global/engine/collections/shelves'
import {BUNDLE_LIST} from '#server/bot/callbacks/routes'

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

/** Граница между итогом и раскрытым списком в тексте сообщения (bundleListAction). */
export const LIST_MARKER = '\n\n📋 Списки'

/** Готовые списки расчётов: связка, полки, тайтлы по порядку (запрос владельца 23.11). */
export const bundleListText = (runs: RunRow[]): string => {
    const name = (key: string) => {
        const bundle = BUNDLES.find(item => item.key === key)
        return bundle ? `${bundle.emoji} «${bundle.title}»` : key
    }
    const blocks = runs.map(run => {
        const items = run.items ?? []
        if (!items.length) return `${name(run.bundle_key)}: список пуст`
        const shelves = [...new Set(items.map(item => item.shelf))]
        const lines = shelves.flatMap(shelf => [
            ...(shelves.length > 1 ? [`— ${SHELVES[shelf as ShelfKey]?.label ?? shelf}`] : []),
            ...items.filter(item => item.shelf === shelf).map((item, index) => `${index + 1}. ${item.title}`)
        ])
        return [`${name(run.bundle_key)} · ${items.length}`, ...lines].join('\n')
    })
    return `${LIST_MARKER.trim()}\n\n${blocks.join('\n\n')}`
}

/** Кнопка под итогом: показать или скрыть списки. Нет расчётов со списком — без кнопки. */
export const bundleListKeyboard = (runIds: string[], open = true) => ({
    inline_keyboard: [[{text: open ? '📋 Показать список' : '▲ Скрыть список', callback_data: BUNDLE_LIST.encode({runs: runIds, open})}]]
})

const listRunIds = (runs: RunRow[]) =>
    runs.filter(run => run.status === 'done' && run.items?.length && /^[0-9a-f]{8}/i.test(String(run.id))).map(run => String(run.id).toLowerCase())

/** Отправить итог администратору; без токена (локальный прогон) — только в лог. */
export const notifyBundleRun = async (text: string, env: NodeJS.ProcessEnv = process.env, runs: RunRow[] = []) => {
    const ids = listRunIds(runs)
    const token = env.TELEGRAM_TOKEN?.trim()
    const chatId = env.BUNDLES_NOTIFY_CHAT_ID?.trim()
    if (!token || !chatId) return console.log(`[BUNDLES] Уведомление не отправлено (нет TELEGRAM_TOKEN или чата):\n${text}`)
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({
                chat_id: chatId,
                text,
                link_preview_options: {is_disabled: true},
                ...(ids.length ? {reply_markup: bundleListKeyboard(ids)} : {})
            }),
            signal: AbortSignal.timeout(15_000)
        })
        if (!response.ok) console.warn('[BUNDLES] Уведомление не отправлено', response.status, await response.text())
    } catch (error) {
        console.warn('[BUNDLES] Уведомление не отправлено', error instanceof Error ? error.message : error)
    }
}

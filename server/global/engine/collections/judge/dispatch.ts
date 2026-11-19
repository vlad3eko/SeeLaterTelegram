import {pickBundles} from '#server/global/engine/collections/judge/run'
import {getBundleStore} from '#server/global/engine/collections/judge/store'
import type {Bundle} from '#server/global/engine/collections/bundles'

/**
 * Кнопка «⚙️ Сгенерировать связки» (экран «🧩 Связки», только админ): запуск workflow
 * .github/workflows/collection-bundles.yml через GitHub API — одна следующая связка по очереди
 * планировщика (сначала ни разу не прогонявшиеся судимые, затем «сырые» автоматические).
 *
 * Токен — GITHUB_ACTIONS_TOKEN: fine-grained personal access token на этот репозиторий с правом
 * Actions: Read and write. Репозиторий — GITHUB_ACTIONS_REPO (owner/name), по умолчанию основной.
 */

const WORKFLOW = 'collection-bundles.yml'
const DEFAULT_REPO = 'vlad3eko/SeeLaterTelegram'
const API = 'https://api.github.com'

export type DispatchResult =
    | {status: 'started', bundle?: Bundle}
    | {status: 'busy'}
    | {status: 'no-token'}
    | {status: 'failed', message: string}

type Fetch = typeof fetch

export const dispatchBundles = async (
    {env = process.env, fetchImpl = fetch, nextBundle}: {env?: NodeJS.ProcessEnv, fetchImpl?: Fetch, nextBundle?: () => Promise<Bundle | undefined>} = {}
): Promise<DispatchResult> => {
    const token = env.GITHUB_ACTIONS_TOKEN?.trim()
    if (!token) return {status: 'no-token'}
    const repo = env.GITHUB_ACTIONS_REPO?.trim() || DEFAULT_REPO
    const ref = env.GITHUB_ACTIONS_REF?.trim() || 'master'
    const headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'collections-bot'
    }
    const base = `${API}/repos/${repo}/actions/workflows/${WORKFLOW}`

    try {
        // Судья уже работает или стоит в очереди — второй запуск взял бы ту же связку.
        for (const status of ['in_progress', 'queued']) {
            const response = await fetchImpl(`${base}/runs?status=${status}&per_page=1`, {headers, signal: AbortSignal.timeout(15_000)})
            if (!response.ok) return {status: 'failed', message: `GitHub ${response.status}`}
            const body = await response.json() as {total_count?: number}
            if ((body.total_count ?? 0) > 0) return {status: 'busy'}
        }

        const bundle = await (nextBundle ?? (async () => (await pickBundles(await getBundleStore(), 1))[0]))().catch(() => undefined)
        const response = await fetchImpl(`${base}/dispatches`, {
            method: 'POST',
            headers: {...headers, 'content-type': 'application/json'},
            body: JSON.stringify({ref, inputs: {count: '1'}}),
            signal: AbortSignal.timeout(15_000)
        })
        if (response.status !== 204 && !response.ok) return {status: 'failed', message: `GitHub ${response.status}`}
        return {status: 'started', ...(bundle ? {bundle} : {})}
    } catch (error) {
        return {status: 'failed', message: error instanceof Error ? error.message : String(error)}
    }
}

/** Текст ответа на кнопку. */
export const dispatchMessage = (result: DispatchResult): string => {
    switch (result.status) {
        case 'started':
            return result.bundle
                ? `Судья запущен: «${result.bundle.title}». Это займёт около 20 минут — потом откройте связки заново.`
                : 'Судья запущен. Это займёт около 20 минут.'
        case 'busy':
            return 'Судья уже работает — дождитесь окончания текущего запуска.'
        case 'no-token':
            return 'Не задан GITHUB_ACTIONS_TOKEN — запуск из бота недоступен.'
        case 'failed':
            return `Не удалось запустить судью: ${result.message}`
    }
}

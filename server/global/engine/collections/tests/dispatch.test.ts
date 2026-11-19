import assert from 'node:assert/strict'
import {test} from 'node:test'
import {dispatchBundles, dispatchMessage} from '#server/global/engine/collections/judge/dispatch'
import {bundleByKey} from '#server/global/engine/collections/bundles'
import {renderWizard} from '#server/bot/actions/collections/wizardView'
import {emptyState} from '#server/bot/actions/collections/wizardState'

/** Заглушка GitHub API: счётчики запущенных/ожидающих запусков и журнал запросов. */
const fakeGitHub = (running = {in_progress: 0, queued: 0}, dispatchStatus = 204) => {
    const calls: Array<{url: string, method: string, body?: any, auth?: string}> = []
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
        const headers = init.headers as Record<string, string>
        calls.push({url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined, auth: headers?.Authorization})
        if (url.endsWith('/dispatches')) return new Response(null, {status: dispatchStatus})
        const status = new URL(url).searchParams.get('status') as keyof typeof running
        return Response.json({total_count: running[status] ?? 0})
    }) as typeof fetch
    return {calls, fetchImpl}
}

const env = {GITHUB_ACTIONS_TOKEN: 'test-token'} as NodeJS.ProcessEnv
const twist = bundleByKey('twist')!

test('кнопка «Сгенерировать связки»: запуск одной следующей связки', async () => {
    const {calls, fetchImpl} = fakeGitHub()
    const result = await dispatchBundles({env, fetchImpl, nextBundle: async () => twist})
    assert.deepEqual(result, {status: 'started', bundle: twist})
    const dispatch = calls.find(call => call.method === 'POST')!
    assert.match(dispatch.url, /\/repos\/[^/]+\/[^/]+\/actions\/workflows\/collection-bundles\.yml\/dispatches$/)
    assert.deepEqual(dispatch.body, {ref: 'master', inputs: {count: '1'}})
    assert.equal(dispatch.auth, 'Bearer test-token')
    assert.match(dispatchMessage(result), /«Ты не угадаешь финал»/)
})

test('кнопка «Сгенерировать связки»: судья уже работает — второй запуск не ставится', async () => {
    for (const running of [{in_progress: 1, queued: 0}, {in_progress: 0, queued: 1}]) {
        const {calls, fetchImpl} = fakeGitHub(running)
        assert.deepEqual(await dispatchBundles({env, fetchImpl, nextBundle: async () => twist}), {status: 'busy'})
        assert.ok(!calls.some(call => call.method === 'POST'))
    }
})

test('кнопка «Сгенерировать связки»: нет токена, ошибка GitHub', async () => {
    const {calls, fetchImpl} = fakeGitHub()
    assert.deepEqual(await dispatchBundles({env: {} as NodeJS.ProcessEnv, fetchImpl}), {status: 'no-token'})
    assert.equal(calls.length, 0)
    const failing = fakeGitHub(undefined, 422)
    const result = await dispatchBundles({env, fetchImpl: failing.fetchImpl, nextBundle: async () => twist})
    assert.deepEqual(result, {status: 'failed', message: 'GitHub 422'})
})

test('экран связок: кнопка генерации справа от «Назад» — только у админа', () => {
    const state = {...emptyState(), screen: 'bundles' as const, group: 'movies' as const, shelf: 'movie' as const, section: 'movies' as const}
    const lastRow = (admin: boolean) => renderWizard(state, {admin, bundles: []}).keyboard.inline_keyboard.at(-1)!
    assert.deepEqual(lastRow(true).map((button: any) => button.callback_data), ['col:b', 'col:gb'])
    assert.equal(lastRow(true)[1]?.text, '⚙️ Сгенерировать связки')
    assert.deepEqual(lastRow(false).map((button: any) => button.callback_data), ['col:b'])
})

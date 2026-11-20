import {test} from 'node:test'
import assert from 'node:assert/strict'
import {BUNDLES} from '../bundles'
import {bundleRunSummary} from '../judge/notify'
import type {RunRow} from '../judge/store'

const run = (patch: Partial<RunRow>): RunRow => ({id: '1', bundle_key: BUNDLES[0]!.key, status: 'done', stats: {}, items: [], created_at: '', ...patch})

test('итог судьи: строка на связку, ошибка запуска, ссылка', () => {
    const [bundle] = BUNDLES
    const text = bundleRunSummary([
        run({stats: {publishable: true, ready: 12, verdicts: {yes: 20, borderline: 4, no: 30}}}),
        run({stats: {publishable: false, verdicts: {yes: 1, borderline: 0, no: 2}}}),
        run({status: 'failed', error: 'Gemini 503\nstack'})
    ], {link: 'https://github.com/x/y/actions/runs/1'})
    assert.equal(text, [
        '🧩 Судья закончил связки',
        `✅ ${bundle!.emoji} «${bundle!.title}»: в подборке 12 · да 20, погранично 4, нет 30`,
        `⚠️ ${bundle!.emoji} «${bundle!.title}»: контроль провален — подборка не показывается · да 1, погранично 0, нет 2`,
        `❌ ${bundle!.emoji} «${bundle!.title}»: ошибка — Gemini 503`,
        'https://github.com/x/y/actions/runs/1'
    ].join('\n'))
    assert.match(bundleRunSummary([], {error: 'Таблиц нет'}), /остановился с ошибкой\n❌ Таблиц нет/)
})

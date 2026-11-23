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

test('итог судьи: списки расчётов и кнопка «Показать список»', async () => {
    const {bundleListText, bundleListKeyboard, LIST_MARKER} = await import('../judge/notify')
    const {BUNDLE_LIST} = await import('#server/bot/callbacks/routes')
    const [bundle] = BUNDLES
    const text = bundleListText([run({id: 'abcdef12-0000', items: [
        {shelf: 'movie', media_type: 'movie', id: 1, title: 'Первый', score: 1, trailer_key: '', trailer_language: ''},
        {shelf: 'series', media_type: 'tv', id: 2, title: 'Второй', score: 1, trailer_key: '', trailer_language: ''}
    ]})])
    assert.equal(text, `📋 Списки\n\n${bundle!.emoji} «${bundle!.title}» · 2\n— Фильмы\n1. Первый\n— Сериалы\n1. Второй`)
    assert.ok(`итог${LIST_MARKER}`.endsWith(text.split('\n')[0]!))

    const data = bundleListKeyboard(['abcdef12-3456-7890', '12345678-aaaa'], true).inline_keyboard[0]![0]!.callback_data
    assert.equal(data, 'bnd:l:abcdef12,12345678:1')
    assert.deepEqual(BUNDLE_LIST.parse({match: data.match(BUNDLE_LIST.pattern)}), {runs: ['abcdef12', '12345678'], open: true})
})

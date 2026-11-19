import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createMemo} from '#server/global/engine/collections/memo'
import {tmdbTtl} from '#server/global/engine/collections/tmdb'
import {isMissingTable} from '#server/global/engine/collections/trailers'

test('кэш: одновременные одинаковые запросы — один вызов, повтор — из памяти', async () => {
    const memo = createMemo<number>()
    let calls = 0
    const load = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return 42 }
    const [a, b] = await Promise.all([memo.get('k', 60_000, load), memo.get('k', 60_000, load)])
    assert.equal(a, 42)
    assert.equal(b, 42)
    assert.equal(calls, 1, 'параллельные ждут один ответ')
    await memo.get('k', 60_000, load)
    assert.equal(calls, 1, 'повтор — из памяти')
})

test('кэш: истёкшее значение загружается заново, ошибка не запоминается', async () => {
    const memo = createMemo<string>()
    let calls = 0
    await memo.get('k', 0, async () => { calls++; return 'a' })
    await memo.get('k', 0, async () => { calls++; return 'b' })
    assert.equal(calls, 2, 'срок 0 — каждый раз заново')

    await assert.rejects(memo.get('e', 60_000, async () => { throw new Error('сбой') }))
    assert.equal(await memo.get('e', 60_000, async () => 'ok'), 'ok', 'после ошибки — новая попытка')
})

test('кэш: старые записи вытесняются по лимиту', async () => {
    const memo = createMemo<number>({maxEntries: 2})
    let calls = 0
    const load = (value: number) => async () => { calls++; return value }
    await memo.get('a', 60_000, load(1))
    await memo.get('b', 60_000, load(2))
    await memo.get('c', 60_000, load(3))
    await memo.get('a', 60_000, load(1))
    assert.equal(calls, 4, '«a» вытеснена третьей записью')
})

test('TMDB: выдачи кэшируются 30 минут, карточки и ключевые слова — 6 часов', () => {
    assert.equal(tmdbTtl('discover/movie?page=1'), 30 * 60_000)
    assert.equal(tmdbTtl('trending/movie/week'), 30 * 60_000)
    assert.equal(tmdbTtl('movie/603/keywords'), 6 * 60 * 60_000)
    assert.equal(tmdbTtl('person/1038/movie_credits?language=ru-RU'), 6 * 60 * 60_000)
})

test('трейлеры: кэш выключается только если нет таблицы, а не от разового сбоя', () => {
    assert.equal(isMissingTable({code: '42P01', message: 'relation "media_trailers" does not exist'}), true)
    assert.equal(isMissingTable({code: 'PGRST205', message: "Could not find the table 'public.media_trailers'"}), true)
    assert.equal(isMissingTable(new Error('fetch failed')), false)
    assert.equal(isMissingTable({code: '57014', message: 'canceling statement due to statement timeout'}), false)
})

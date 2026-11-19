import assert from 'node:assert/strict'
import {test} from 'node:test'
import {freshPool, yearOf} from '#server/global/engine/collections/similar'

const item = (date: string) => ({release_date: date})
const years = (pool: Array<{release_date: string}>) => pool.map(entry => yearOf(entry))

test('yearOf: фильм, сериал, без даты', () => {
    assert.equal(yearOf({release_date: '2026-09-16'}), 2026)
    assert.equal(yearOf({first_air_date: '2025-10-26'}), 2025)
    assert.equal(yearOf({release_date: ''}), undefined)
})

test('freshPool: не старше тайтла на 10 лет, новее можно', () => {
    const pool = [item('1978-09-02'), item('2002-10-31'), item('2016-01-01'), item('2025-06-18'), item('2030-01-01'), item('')]
    assert.deepEqual(years(freshPool(pool, entry => entry, 2026, 1)), [2016, 2025, 2030])
    assert.deepEqual(years(freshPool(pool, entry => entry, 1985, 1)), [1978, 2002, 2016, 2025, 2030])
})

test('freshPool: мало кандидатов — окно 15, потом 20 лет, старше никогда', () => {
    const pool = [item('1978-09-02'), item('2008-01-01'), item('2012-01-01'), item('2020-01-01')]
    assert.deepEqual(years(freshPool(pool, entry => entry, 2026, 2)), [2012, 2020])
    assert.deepEqual(years(freshPool(pool, entry => entry, 2026, 3)), [2008, 2012, 2020])
    assert.deepEqual(years(freshPool(pool, entry => entry, 2026, 10)), [2008, 2012, 2020])
})

test('freshPool: у тайтла нет года — без фильтра', () => {
    const pool = [item('1978-09-02'), item('')]
    assert.equal(freshPool(pool, entry => entry, undefined).length, 2)
})

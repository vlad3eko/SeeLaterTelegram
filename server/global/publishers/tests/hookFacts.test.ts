import {test} from 'node:test'
import assert from 'node:assert/strict'
import {hookFactLines, type HookFacts, unsupportedClaims} from '../../engine/instagram/reel/utils/hookFacts'

const succession: HookFacts = {
    cast: ['Джереми Стронг', 'Киран Калкин'],
    creators: ['Джесси Армстронг'],
    season: {number: 4, returning: false},
    awards: [{award: 'Эмми', won: true, category: 'премия «Эмми» за лучший драматический сериал', year: 2023}]
}
const threeBody: HookFacts = {cast: [], creators: ['Дэвид Бениофф'], season: {number: 2, returning: true}, awards: []}
const nominee: HookFacts = {cast: [], creators: [], awards: [{award: 'Эмми', won: false}]}

test('награда: только из фактов, номинация не становится победой', () => {
    assert.deepEqual(unsupportedClaims('Обладатель «Эмми» о семье миллиардеров', succession), [])
    assert.deepEqual(unsupportedClaims('Номинант на «Эмми» снова в эфире', nominee), [])
    assert.ok(unsupportedClaims('Оскароносная драма о цене власти', succession).length)
    assert.ok(unsupportedClaims('Обладатель «Эмми» о семье', nominee).length)
    assert.ok(unsupportedClaims('Премия за лучший сериал года', {cast: [], creators: [], awards: []}).length)
})

test('новый сезон и «хит»', () => {
    assert.deepEqual(unsupportedClaims('Создатели «Игры престолов» возвращаются', threeBody), [])
    assert.ok(unsupportedClaims('Сериал о семье Рой возвращается', succession).length)
    assert.ok(unsupportedClaims('Главный хит года снова с нами', threeBody).length)
    assert.deepEqual(unsupportedClaims('Хитрый план двух братьев', undefined), [])
})

test('строки фактов для промпта', () => {
    const lines = hookFactLines(succession)
    assert.ok(lines.includes('В главных ролях: Джереми Стронг, Киран Калкин'))
    assert.ok(lines.some(line => line.startsWith('Получил: премия «Эмми»')))
    assert.deepEqual(hookFactLines(undefined), [])
})

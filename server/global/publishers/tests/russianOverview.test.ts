import {test} from 'node:test'
import assert from 'node:assert/strict'
import {cleanOverview, overviewPrompt, type OverviewFacts} from '../../engine/youtube/russianOverview'

const facts: OverviewFacts = {
    title: 'The Nightingale', originalTitle: 'The Nightingale', year: '2027', kind: 'фильм',
    director: 'Mélanie Laurent', cast: ['Dakota Fanning', 'Elle Fanning'],
    englishOverview: 'The lives of two French sisters are torn apart by the onset of World War II.'
}

test('сюжет для автопубликации: запрос с годом, режиссёром и актёрами, перевод — запасной путь', () => {
    const search = overviewPrompt(facts, true)
    assert.match(search, /Фильм «The Nightingale» \(2027, режиссёр Mélanie Laurent, в ролях Dakota Fanning, Elle Fanning\)/)
    assert.match(search, /Найди в интернете/)
    assert.match(search, /переведи описание TMDB/)
    assert.match(search, /ответь ровно: НЕТ/)
    assert.doesNotMatch(overviewPrompt({...facts, englishOverview: undefined}, true), /TMDB/)
    assert.match(overviewPrompt(facts, false), /^Фильм .*Переведи на русский/)
})

test('сюжет для автопубликации: ответ модели чистится, «НЕТ» и мусор отбрасываются', () => {
    assert.equal(
        cleanOverview('**Сюжет:** Жизнь двух сестёр-француженок рушится с началом Второй мировой войны [1, 2]. https://example.com'),
        'Жизнь двух сестёр-француженок рушится с началом Второй мировой войны.'
    )
    assert.equal(cleanOverview('Вера отходит на второй второй план перед жаждой наживы пастора.'), 'Вера отходит на второй план перед жаждой наживы пастора.')
    assert.equal(cleanOverview('НЕТ'), undefined)
    assert.equal(cleanOverview('НЕТ.'), undefined)
    assert.equal(cleanOverview('No information available about this film.'), undefined)
    assert.equal(cleanOverview('Коротко.'), undefined)
})

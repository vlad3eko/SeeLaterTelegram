import {test} from 'node:test'
import assert from 'node:assert/strict'
import {findExcludedTitleReason, findUnsuitableMediaReason} from '../../engine/youtube/config'

const film = {overview: 'Сюжет', poster_path: '/p.jpg', genres: [{id: 18, name: 'драма'}], vote_count: 500, origin_country: ['US']}

test('очередь YouTube: публикуются только тайтлы с постером, без ток-шоу, реалити и документалок', () => {
    assert.equal(findUnsuitableMediaReason(film), undefined)
    // Нет русского сюжета — не причина: его допишет Gemini перед публикацией.
    assert.equal(findUnsuitableMediaReason({...film, overview: '  '}), undefined)
    assert.equal(findUnsuitableMediaReason({...film, poster_path: null}), 'в TMDB нет постера')
    assert.equal(findUnsuitableMediaReason({...film, genres: [{id: 10767}, {id: 35}]}), 'не фильм и не сериал (ток-шоу)')
    assert.equal(findUnsuitableMediaReason({...film, overview: '', genres: [{id: 10764}]}), 'не фильм и не сериал (реалити-шоу)')
    assert.equal(findUnsuitableMediaReason({...film, genres: [{id: 99}, {id: 80}]}), 'не фильм и не сериал (документальный)')
})

test('очередь YouTube: промо-нарезки «Watch the trailer for … now!» — не трейлер', () => {
    assert.equal(findExcludedTitleReason('Reba. Frickin. McEntire. Watch the trailer for THE COMEBACK KING now!'), 'watch the trailer')
    assert.equal(findExcludedTitleReason('The Comeback King | Official Trailer'), undefined)
})

test('очередь YouTube: индонезийские тайтлы не публикуются', () => {
    assert.equal(findUnsuitableMediaReason({...film, origin_country: ['ID']}), 'страна: Индонезия')
    assert.equal(findUnsuitableMediaReason({...film, origin_country: undefined, production_countries: [{iso_3166_1: 'ID'}]}), 'страна: Индонезия')
})

test('очередь YouTube: малоизвестное не публикуется — новинку вытягивают оценки, популярность или известный актёр', () => {
    const fresh = {...film, vote_count: 0, popularity: 1.2}
    const unknown = 'малоизвестный: нет ни оценок, ни популярности, ни известных актёров'
    // Collect & Praise (20.11): два актёра, самый известный — 1.8.
    assert.equal(findUnsuitableMediaReason(fresh, [{popularity: 0.9}, {popularity: 1.8}]), unknown)
    assert.equal(findUnsuitableMediaReason(fresh), unknown)
    // The Comeback King: Глен Пауэлл — 3.2.
    assert.equal(findUnsuitableMediaReason(fresh, [{popularity: 3.2}]), undefined)
    assert.equal(findUnsuitableMediaReason({...fresh, popularity: 15}), undefined)
    assert.equal(findUnsuitableMediaReason({...fresh, vote_count: 6175}), undefined)
})

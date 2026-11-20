import {test} from 'node:test'
import assert from 'node:assert/strict'
import {findExcludedTitleReason, findUnsuitableMediaReason} from '../../engine/youtube/config'

const film = {overview: 'Сюжет', poster_path: '/p.jpg', genres: [{id: 18, name: 'драма'}]}

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

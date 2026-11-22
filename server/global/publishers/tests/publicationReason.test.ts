import test from 'node:test'
import assert from 'node:assert/strict'
import {publicationReason, seasonFromTitle, videoKind} from '#server/global/engine/youtube/publicationReason'

const today = '2026-11-22'
const presumed = {
    first_air_date: '2024-06-11',
    seasons: [
        {season_number: 0, air_date: '2024-05-01'},
        {season_number: 1, air_date: '2024-06-11'},
        {season_number: 2, air_date: '2027-02-18'}
    ]
}

test('publicationReason: тизер второго сезона с датой выхода', () => {
    assert.equal(
        publicationReason({videoTitle: 'Presumed Innocent — Season 2 Official Teaser | Apple TV', media: presumed, mediaType: 'tv', contentType: 'series', today}),
        'Новый тизер-трейлер второго сезона, который выйдет 18 февраля 2027'
    )
})

test('publicationReason: сезон не назван — ближайший объявленный', () => {
    assert.equal(
        publicationReason({videoTitle: 'Презумпция невиновности — трейлер (дубляж)', media: presumed, mediaType: 'tv', contentType: 'series', today}),
        'Новый русский трейлер второго сезона, который выйдет 18 февраля 2027'
    )
})

test('publicationReason: фильм — вышел или выйдет; без даты — без хвоста', () => {
    assert.equal(
        publicationReason({videoTitle: 'Dune: Part Three | Official Trailer', media: {release_date: '2026-12-18'}, mediaType: 'movie', contentType: 'movie', today}),
        'Новый трейлер фильма, который выйдет 18 декабря 2026'
    )
    assert.equal(
        publicationReason({videoTitle: 'Zootopia 2 Final Trailer', media: {release_date: '2025-11-26'}, mediaType: 'movie', contentType: 'cartoon', today}),
        'Новый финальный трейлер мультфильма, который вышел 26 ноября 2025'
    )
    assert.equal(
        publicationReason({videoTitle: 'Clip', media: {}, mediaType: 'movie', contentType: 'movie', today}),
        'Новый отрывок фильма'
    )
})

test('publicationReason: первый сезон сериала, сезон в заголовке без даты', () => {
    assert.equal(
        publicationReason({videoTitle: 'Show Teaser', media: {first_air_date: '2027-01-05', seasons: [{season_number: 1, air_date: '2027-01-05'}]}, mediaType: 'tv', contentType: 'series', today}),
        'Новый тизер-трейлер сериала, который выйдет 5 января 2027'
    )
    assert.equal(
        publicationReason({videoTitle: '3 сезон — трейлер', media: presumed, mediaType: 'tv', contentType: 'series', today}),
        'Новый трейлер третьего сезона'
    )
})

test('videoKind и seasonFromTitle', () => {
    assert.equal(videoKind('Official Featurette'), 'ролик о съёмках')
    assert.equal(videoKind('Что-то новое'), 'ролик')
    assert.equal(seasonFromTitle('Season 4 Trailer'), 4)
    assert.equal(seasonFromTitle('2-й сезон'), 2)
    assert.equal(seasonFromTitle('S3 | Teaser'), 3)
    assert.equal(seasonFromTitle('Trailer'), undefined)
})

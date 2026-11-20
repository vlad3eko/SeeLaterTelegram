import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseTrailerTitle, titleMatch} from '../../engine/youtube/matchTmdbMedia'
import {isRussianAudio, youtubeQueueConfig} from '../../engine/youtube/config'
import {isRussianTrailerFor} from '../../engine/youtube/russianTrailer'
import {pickDuplicates} from '../../engine/youtube/youtubeQueue'

const nextYear = new Date().getFullYear() + 1

test('русские каналы: названия всех четырёх форматов разбираются', () => {
    assert.deepEqual(parseTrailerTitle('ПРИЗРАЧНЫЙ СОЛДАТ Русский трейлер (4K Дубляж, 2026) Джеймс Кэвизел, Боевик'), {name: 'ПРИЗРАЧНЫЙ СОЛДАТ', year: 2026})
    assert.deepEqual(parseTrailerTitle('НОВЫЕ ПОХОЖДЕНИЯ КЛИФФА БУТА Финальный Русский трейлер (4K Субтитры, 2026) Брэд Питт'), {name: 'НОВЫЕ ПОХОЖДЕНИЯ КЛИФФА БУТА', year: 2026})
    assert.deepEqual(parseTrailerTitle('Соловей — Русский Трейлер (Дубляж, 4K, 2027)'), {name: 'Соловей', year: 2027})
    assert.deepEqual(parseTrailerTitle('Неуязвимый (5 сезон) — Русский Трейлер Тизер (Субтитры, 4K, 2027)'), {name: 'Неуязвимый', year: 2027, isSeason: true})
    assert.deepEqual(parseTrailerTitle('ЗАДАЧА ТРЁХ ТЕЛ (2 СЕЗОН) Русский трейлер (4K Дубляж, 2027) Эйса Гонсалес'), {name: 'ЗАДАЧА ТРЁХ ТЕЛ', year: 2027, isSeason: true})
    assert.deepEqual(parseTrailerTitle('Задача трёх тел: 2 сезон | Официальный тизер 4К | Дубляж | Netflix'), {name: 'Задача трёх тел', isSeason: true})
    // Английские названия — как раньше.
    assert.deepEqual(parseTrailerTitle('Wednesday: Season 2 | Official Teaser | Netflix'), {name: 'Wednesday', isSeason: true})
})

test('русская озвучка: дубляж и озвучка — да, субтитры — нет', () => {
    assert.equal(isRussianAudio('Не жалей сахара | Официальный трейлер 4К | Дубляж | Netflix'), true)
    assert.equal(isRussianAudio('12 рождественских игр Салиш | Официальный трейлер 4К | Озвучка | Netflix'), true)
    assert.equal(isRussianAudio('ГАРФИЛД Русский трейлер (4K Субтитры, 2026) Ламорн Моррис'), false)
    assert.equal(isRussianAudio('Не жизнь, а сказка | Официальный трейлер 4К | Netflix'), false)
})

test('название без номера части совпадает только с новинкой', () => {
    const iceAge = {title: 'Ледниковый период: Точка кипения', original_title: 'Ice Age: Boiling Point', release_date: `${nextYear}-01-28`}
    assert.equal(titleMatch('Ледниковый период 6: Точка кипения', iceAge), 'part')
    assert.equal(titleMatch('Ледниковый период: Точка кипения', iceAge), 'exact')
    // «Пчеловод 2» не находит первого «Пчеловода» (2024).
    assert.equal(titleMatch('Пчеловод 2', {title: 'Пчеловод', release_date: '2024-01-10'}), undefined)
})

test('русский трейлер для карточки: по media_id или по названию, без субтитров и отрывков', () => {
    const film = {title: 'Соловей', original_title: 'The Nightingale', release_date: '2027-03-17'}
    const row = (title: string, extra = {}) => ({video_id: 'abcdefghijk', title, media_id: null, media_type: null, video_published_at: null, ...extra})
    assert.equal(isRussianTrailerFor(row('СОЛОВЕЙ Русский трейлер (4K Дубляж, 2027) Эль Фаннинг'), film, 'movie', 458896), true)
    assert.equal(isRussianTrailerFor(row('Соловей — Русский Трейлер (Субтитры, 4K, 2027)'), film, 'movie', 458896), false)
    assert.equal(isRussianTrailerFor(row('Соловей — Отрывок «Письмо» (Дубляж, 2027)'), film, 'movie', 458896), false)
    // Однофамилец другого года.
    assert.equal(isRussianTrailerFor(row('Соловей — Русский трейлер (Дубляж, 2019)'), film, 'movie', 458896), false)
    // Название не совпало, но очередь уже сопоставила ролик с этим фильмом.
    assert.equal(isRussianTrailerFor(row('Мангуст — Русский трейлер (Дубляж, 2027)', {media_id: 458896, media_type: 'movie'}), film, 'movie', 458896), true)
})

test('очередь: один фильм — одна строка, русская озвучка с первого канала важнее', () => {
    const channels = youtubeQueueConfig().channels
    const [kinoman, topkino] = channels.filter(channel => channel.priority)
    const netflix = channels.find(channel => channel.name === 'Netflix')!
    const row = (id: number, channel: string, title: string, published: string, media_id: number | null = 1) =>
        ({id, channel_id: channel, title, media_id, media_type: 'tv', video_published_at: published})
    const groups = pickDuplicates([
        row(1, netflix.id, '3 Body Problem: Season 2 | Official Teaser | Netflix', '2026-11-17T15:00:00Z'),
        row(2, topkino!.id, 'Задача трёх тел (2 сезон) — Русский Трейлер (4K Дубляж, 2027)', '2026-11-18T10:00:00Z'),
        row(3, kinoman!.id, 'Задача трёх тел (2 сезон) — Русский трейлер (Дубляж, 2027)', '2026-11-18T12:00:00Z'),
        row(4, netflix.id, 'Другой сериал | Official Trailer', '2026-11-18T12:00:00Z', 2)
    ], channels)
    assert.equal(groups.length, 1)
    assert.equal(groups[0]!.keep.id, 3)
    assert.deepEqual(groups[0]!.drop.map(item => item.id).sort(), [1, 2])
})

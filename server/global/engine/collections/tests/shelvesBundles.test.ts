import assert from 'node:assert/strict'
import {test} from 'node:test'
import {classifyOrigin, fitsShelf, SHELVES, shelfOf, shelfQuery} from '#server/global/engine/collections/shelves'
import {BUNDLES, bundleByKey, bundleSections, bundlesFor, rubricOf} from '#server/global/engine/collections/bundles'
import {bundleMatches, bundleQuery, bundleScore, votesRange, weightedRating} from '#server/global/engine/collections/bundleRules'
import {mergeGenres, shelfForParams} from '#server/global/engine/collections/buildCollection'
import {tagsForShelf} from '#server/global/engine/collections/catalog'
import {fuseRanks, similarScore} from '#server/global/engine/collections/similar'

/* ------------------------------------ Полки ------------------------------------ */

test('классификатор: аниме — Япония, дунхуа — материковый Китай, остальное — мультфильмы', () => {
    const anime = {genre_ids: [16], origin_country: ['JP'], original_language: 'ja'}
    const donghua = {genre_ids: [16, 10759], origin_country: ['CN'], original_language: 'zh'}
    const pixar = {genre_ids: [16, 10751], origin_country: ['US'], original_language: 'en'}
    assert.equal(classifyOrigin(anime), 'japan')
    assert.equal(shelfOf(anime, 'tv'), 'anime_series')
    assert.equal(shelfOf(donghua, 'tv'), 'donghua_series')
    assert.equal(shelfOf(pixar, 'movie'), 'animated_movie')
    assert.equal(shelfOf({genre_ids: [18]}, 'movie'), 'movie')
    assert.equal(shelfOf({genre_ids: [18]}, 'tv'), 'series')
})

test('классификатор: совместное производство и язык', () => {
    // Японская студия + американский дистрибьютор, японский язык — аниме.
    assert.equal(classifyOrigin({production_countries: [{iso_3166_1: 'JP'}, {iso_3166_1: 'US'}], original_language: 'ja'}), 'japan')
    // Японские деньги, английский язык и западная студия — смешанное (полка мультфильмов).
    assert.equal(classifyOrigin({production_countries: [{iso_3166_1: 'JP'}, {iso_3166_1: 'US'}], original_language: 'en'}), 'mixed')
    // JP + CN — по языку.
    assert.equal(classifyOrigin({origin_country: ['JP', 'CN'], original_language: 'zh'}), 'mainland_china')
    // Нет стран — по языку; Тайвань — не дунхуа.
    assert.equal(classifyOrigin({original_language: 'ja'}), 'japan')
    assert.equal(classifyOrigin({origin_country: ['TW'], original_language: 'zh'}), 'taiwan')
    assert.equal(shelfOf({genre_ids: [16], origin_country: ['TW'], original_language: 'zh'}, 'tv'), 'animated_series')
    assert.equal(classifyOrigin({}), 'unknown')
})

test('запрос полки: анимация — with_genres 16 и страна; живое кино — без анимации', () => {
    assert.deepEqual(shelfQuery(SHELVES.anime_series), {without_genres: '10763,10764,10767', with_genres: '16', with_origin_country: 'JP'})
    assert.deepEqual(shelfQuery(SHELVES.movie), {without_genres: '16,10770'})
    assert.equal(fitsShelf({genre_ids: [16], original_language: 'ja'}, SHELVES.animated_movie), false)
})

test('полка параметров: тип полки должен совпадать с разделом', () => {
    assert.equal(shelfForParams({section: 'movies', shelf: 'anime_movie'}).key, 'anime_movie')
    assert.equal(shelfForParams({section: 'movies', shelf: 'anime_series'}).key, 'movie')
    assert.equal(shelfForParams({section: 'series_new'}).key, 'series')
})

test('теги полки: у анимации свой порог охвата', () => {
    const anime = tagsForShelf('anime_series').map(tag => tag.key)
    assert.ok(anime.includes('isekai'))
    assert.ok(anime.includes('school_life'))
    assert.ok(!tagsForShelf('movie').map(tag => tag.key).includes('isekai'))
})

/* ------------------------------------ Связки ------------------------------------ */

test('справочник связок: ключи уникальны, у судимых — рубрика и контрольные тайтлы', () => {
    const keys = BUNDLES.map(bundle => bundle.key)
    assert.equal(new Set(keys).size, keys.length)
    for (const bundle of BUNDLES) {
        assert.ok(bundle.title.split(' ').length <= 5, `${bundle.key}: заголовок длинный`)
        assert.ok(bundle.shelves.length > 0)
        const rubric = rubricOf(bundle)
        assert.ok(rubric.criteria.length >= 3)
        assert.ok(rubric.passScore > rubric.borderlineScore)
        if (bundle.kind === 'judged') {
            assert.ok(bundle.rubric, `${bundle.key}: нет рубрики`)
            assert.ok((bundle.controls?.positive.length ?? 0) >= 3, `${bundle.key}: мало положительных контрольных`)
            assert.ok((bundle.controls?.negative.length ?? 0) >= 3, `${bundle.key}: мало отрицательных контрольных`)
            assert.deepEqual(bundleSections(bundle), ['movies', 'series_completed'])
        }
    }
})

test('связки по полке и разделу', () => {
    const animeSeries = bundlesFor('anime_series', 'series_completed').map(bundle => bundle.key)
    assert.ok(animeSeries.includes('isekai'))
    assert.ok(!animeSeries.includes('one_evening'))
    assert.ok(bundlesFor('movie', 'movies').some(bundle => bundle.key === 'one_evening'))
    // «За выходные» — только «Вышли полностью».
    assert.ok(!bundlesFor('series', 'series_new').some(bundle => bundle.key === 'weekend'))
    // Судимые — не в «Новых сериях».
    assert.ok(!bundlesFor('series', 'series_new').some(bundle => bundle.kind === 'judged'))
})

test('запрос связки: понятие, тип «мини-сериал», статусы, голоса от порога полки', () => {
    const survival = bundleQuery(bundleByKey('survival')!, SHELVES.movie)
    assert.equal(survival.params.with_keywords, '10349|3593|9743|155746|336497|179578|353736')
    assert.equal(survival.needsKeywords, true) // boost при ранжировании по релевантности

    const weekend = bundleQuery(bundleByKey('weekend')!, SHELVES.series)
    assert.equal(weekend.params.with_type, '2')
    assert.equal(weekend.params.with_status, '3|4')
    assert.equal(weekend.needsKeywords, false)

    const underrated = bundleByKey('underrated')!
    assert.deepEqual(votesRange(underrated, SHELVES.movie), {min: 300, max: 3000})
    assert.deepEqual(votesRange(underrated, SHELVES.donghua_series), {min: 20, max: 200})
    assert.equal(bundleQuery(underrated, SHELVES.movie).params['vote_count.lte'], '3000')

    assert.equal(bundleQuery(bundleByKey('horror_comedy')!, SHELVES.movie).params.with_genres, '27,35')
})

test('проверка тайтла по связке', () => {
    const epidemic = bundleByKey('epidemic')!
    const item = {id: 1, genre_ids: [27], vote_average: 7, vote_count: 500}
    assert.equal(bundleMatches(epidemic, SHELVES.movie, item, [188973]), true)
    assert.equal(bundleMatches(epidemic, SHELVES.movie, item, [188973, 262235]), false, 'исключающее слово')
    assert.equal(bundleMatches(epidemic, SHELVES.movie, item, [1]), false, 'нет понятия')
    assert.equal(bundleMatches(epidemic, SHELVES.movie, item, null), true, 'слова не загружались — верим discover')

    const weekend = bundleByKey('weekend')!
    const show = {id: 2, genre_ids: [18], vote_average: 8, vote_count: 900}
    assert.equal(bundleMatches(weekend, SHELVES.series, show, [], {status: 'Ended', type: 'Miniseries', number_of_episodes: 6}), true)
    assert.equal(bundleMatches(weekend, SHELVES.series, show, [], {status: 'Ended', type: 'Miniseries', number_of_episodes: 12}), false)
    assert.equal(bundleMatches(weekend, SHELVES.series, show, [], {status: 'Returning Series', type: 'Miniseries', number_of_episodes: 6}), false)

    const classics = bundleByKey('classics')!
    assert.equal(bundleMatches(classics, SHELVES.movie, {release_date: '1994-09-23', vote_average: 8.7, vote_count: 9000}, null), true)
    assert.equal(bundleMatches(classics, SHELVES.movie, {release_date: '2004-01-01', vote_average: 8.7, vote_count: 9000}, null), false)
})

test('ранжирование: байесовский рейтинг тянет малоизвестное к средней', () => {
    assert.ok(Math.abs(weightedRating(9, 10, 300, 6.5) - 6.58) < 0.01)
    assert.ok(Math.abs(weightedRating(9, 30000, 300, 6.5) - 8.98) < 0.01)
    const survival = bundleByKey('survival')!
    const context = {mean: 6.5, maxLogPopularity: Math.log1p(100)}
    const boosted = bundleScore(survival, SHELVES.movie, {vote_average: 7, vote_count: 2000}, [3593, 9743], context)
    const plain = bundleScore(survival, SHELVES.movie, {vote_average: 7, vote_count: 2000}, [10349], context)
    assert.ok(boosted > plain)
})

test('склейка with_genres: «и» склеивается, «или» уходит в проверку', () => {
    assert.deepEqual(mergeGenres(['16', '35']), {value: '16,35', exact: true})
    assert.deepEqual(mergeGenres(['16', '9648|80']), {value: '16', exact: false})
    assert.deepEqual(mergeGenres([undefined, '9648|80']), {value: '9648|80', exact: true})
    assert.deepEqual(mergeGenres([undefined, undefined]), {value: undefined, exact: true})
})

/* ------------------------------------ «Похожее» ------------------------------------ */

test('«Похожее»: RRF — выше в обоих списках, у similar вес меньше', () => {
    const a = {id: 1}, b = {id: 2}, c = {id: 3}
    const fused = fuseRanks([[a, b], [b, c]], [1, 0.5])
    assert.ok(fused.get(2)!.rrf > fused.get(1)!.rrf, 'b есть в обоих списках')
    assert.ok(fused.get(1)!.rrf > fused.get(3)!.rrf, 'similar весит меньше')
    // Общие ключевые слова весят вдвое больше жанров.
    assert.ok(similarScore(0.5, 1, 1, 4, 0, 2) > similarScore(0.5, 1, 0, 4, 1, 4))
    assert.ok(similarScore(0.5, 1, 0, 4, 0, 2, 1) > similarScore(0.5, 1, 0, 4, 0, 2, 0))
})

test('порог оценки связок 6.0: в запросе discover и в проверке тайтла; связка может поднять порог', () => {
    const epidemic = bundleByKey('epidemic')!
    assert.equal(bundleQuery(epidemic, SHELVES.movie).params['vote_average.gte'], '6')
    const high = BUNDLES.find(bundle => (bundle.criteria.props?.rating?.min ?? 0) > 6)!
    assert.equal(bundleQuery(high, SHELVES[high.shelves[0]!]).params['vote_average.gte'], String(high.criteria.props!.rating!.min))
    assert.equal(bundleMatches(epidemic, SHELVES.movie, {id: 1, genre_ids: [27], vote_average: 5.9, vote_count: 500}, [188973]), false)
    assert.equal(bundleMatches(epidemic, SHELVES.movie, {id: 1, genre_ids: [27], vote_average: 6, vote_count: 500}, [188973]), true)
})

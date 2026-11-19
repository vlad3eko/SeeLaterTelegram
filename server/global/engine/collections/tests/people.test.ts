import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRichListKeyboard} from '#server/global/engine/card/construct/createRichListKeyboard'
import {AWARD_LINKS, birthdayQuery, displayName, MIN_LINKS, findBirthdays, lifeLabel, monthDay, parseBirthdays} from '#server/global/engine/collections/people/birthdays'
import {MAIN_ROLES, personFilms} from '#server/global/engine/collections/people/personTop'
import {renderWizard} from '#server/bot/actions/collections/wizardView'
import {emptyState} from '#server/bot/actions/collections/wizardState'

const binding = (tmdb: number, ru: string | undefined, birth: string, death?: string, en = 'Name') => ({
    tmdb: {value: String(tmdb)}, ...(ru ? {ru: {value: ru}} : {}), en: {value: en},
    birth: {value: `${birth}T00:00:00Z`}, ...(death ? {death: {value: `${death}T00:00:00Z`}} : {})
})

test('именинники: день по Москве, запрос — точные даты по годам, без Индии и России', () => {
    // 21:30 UTC 18 ноября — в Москве уже 19-е.
    assert.equal(monthDay(new Date('2026-11-18T21:30:00Z')), '11-19')
    const query = birthdayQuery('actor', 'alive', '11-19', 2016)
    assert.ok(query.includes('"1962-11-19T00:00:00Z"^^xsd:dateTime'))
    assert.ok(query.includes('wdt:P161'))
    assert.ok(query.includes('FILTER NOT EXISTS { ?p wdt:P570 [] }'))
    assert.ok(query.includes('wd:Q668') && query.includes('wd:Q159'))
    const directors = birthdayQuery('director', 'dead', '11-19', 2016)
    assert.ok(directors.includes('wdt:P57') && directors.includes('BOUND(?death)'))
    // Ушедшие — только умершие с 2015 года.
    assert.ok(directors.includes('?death >= "2015-01-01T00:00:00Z"^^xsd:dateTime'))
    assert.ok(!query.includes('?death >='), 'у живых фильтра по смерти нет')
})

test('именинники: только звёзды — порог статей или номинация в главной категории', () => {
    const actors = birthdayQuery('actor', 'alive', '11-19', 2016)
    assert.ok(actors.includes(`FILTER(?links >= ${AWARD_LINKS})`))
    assert.ok(actors.includes(`?links >= ${MIN_LINKS.actor} || ?lead`))
    assert.ok(actors.includes('wd:Q96474676') && actors.includes('wd:Q96474691'), 'лучшая главная женская / мужская роль')
    assert.ok(!actors.includes('wd:Q96474589'), 'роли второго плана не считаются')
    const directors = birthdayQuery('director', 'alive', '11-19', 2016)
    assert.ok(directors.includes(`?links >= ${MIN_LINKS.director} || ?lead`) && directors.includes('wd:Q96474679'))
})

test('подборки /g: кнопки — только номера, по 5 в ряд', () => {
    const items = Array.from({length: 7}, (_, i) => ({data: {media: {title: `Фильм ${i}`}}, query: {}}))
    const keyboard = createRichListKeyboard(items, [[{text: 'Назад', callback_data: 'b'}]],
        (text, index) => ({text, callback_data: `t:${index}`}), 11, 5)
    assert.deepEqual(keyboard.inline_keyboard.map((row: any[]) => row.map(button => button.text)),
        [['11', '12', '13', '14', '15'], ['16', '17'], ['Назад']])
    assert.equal((keyboard.inline_keyboard[1] as any[])[1].callback_data, 't:6')
    // Без numbersPerRow (старый /g) — «1. Название» по одной.
    const old = createRichListKeyboard(items.slice(0, 1), [[]], (text, index) => ({text, callback_data: String(index)}))
    assert.equal((old.inline_keyboard[0] as any[])[0].text, '1. Фильм 0')
})

test('именинники: разбор ответа — русское имя, дубли, не больше 10', () => {
    const people = parseBirthdays({results: {bindings: [
        binding(1038, 'Джоди Фостер', '1962-11-19'),
        binding(1038, 'Джоди Фостер', '1962-11-19'), // второй ID TMDB / дубль строки
        binding(20124, 'Джин Тирни', '1920-11-19', '1991-11-06'),
        binding(99, undefined, '1970-11-19', undefined, 'No Russian Label')
    ]}})
    assert.deepEqual(people, [
        {id: 1038, name: 'Джоди Фостер', en: 'Name', born: 1962},
        {id: 20124, name: 'Джин Тирни', en: 'Name', born: 1920, died: 1991},
        {id: 99, name: 'No Russian Label', born: 1970}
    ])
    const many = parseBirthdays({results: {bindings: Array.from({length: 30}, (_, i) => binding(i + 1, `Актёр ${i}`, '1980-11-19'))}})
    assert.equal(many.length, 10)
})

test('именинники: возраст и годы жизни', () => {
    assert.equal(lifeLabel({id: 1, name: 'a', born: 1962}, 2026), '64 года')
    assert.equal(lifeLabel({id: 1, name: 'a', born: 1975}, 2026), '51 год')
    assert.equal(lifeLabel({id: 1, name: 'a', born: 1915}, 2026), '111 лет')
    assert.equal(lifeLabel({id: 1, name: 'a', born: 1920, died: 1991}, 2026), '1920–1991')
})

test('именинники: Wikidata только по нажатию, повтор в тот же день — из памяти', async () => {
    let calls = 0
    const fetchImpl = (async () => {
        calls++
        return Response.json({results: {bindings: [binding(1038, 'Джоди Фостер', '1962-11-19')]}})
    }) as typeof fetch
    const date = new Date('2030-03-05T10:00:00Z')
    const first = await findBirthdays('actor', 'alive', {date, fetchImpl})
    const again = await findBirthdays('actor', 'alive', {date, fetchImpl})
    assert.equal(calls, 1)
    assert.deepEqual(again, first)
    await findBirthdays('director', 'alive', {date, fetchImpl})
    assert.equal(calls, 2, 'другой выбор — новый запрос')
})

const film = (id: number, extra: Record<string, unknown> = {}) => ({
    id, title: `Фильм ${id}`, original_language: 'en', genre_ids: [18], release_date: '2000-01-01',
    vote_average: 7, vote_count: 5000, order: 0, character: 'Герой', ...extra
})

test('лучшие роли: только главные, без камео, озвучки, документалок и малоизвестного', () => {
    const films = personFilms({cast: [
        film(1, {vote_average: 8.5}),
        film(2, {order: MAIN_ROLES}), // не главная роль
        film(3, {character: 'Himself'}),
        film(4, {character: 'камео'}),
        film(5, {genre_ids: [16]}), // озвучка мультфильма
        film(6, {genre_ids: [99]}),
        film(7, {vote_count: 20}),
        film(8, {title: 'No Russian Title'}),
        film(9, {original_language: 'hi'}),
        film(10, {release_date: '2999-01-01'}),
        film(11, {vote_average: 7.5}),
        film(1, {vote_average: 8.5}) // дубль (две роли в одном фильме)
    ]}, 'actor')
    assert.deepEqual(films.map(item => item.id), [1, 11])
})

test('лучшие фильмы режиссёра: только Director, порядок — байесовский рейтинг', () => {
    const films = personFilms({crew: [
        film(1, {job: 'Director', vote_average: 9, vote_count: 150}),
        film(2, {job: 'Director', vote_average: 8.2, vote_count: 30000}),
        film(3, {job: 'Writer', vote_average: 9.5})
    ]}, 'director')
    // 9.0 при 150 голосах тянется к средней ниже, чем 8.2 при 30 000.
    assert.deepEqual(films.map(item => item.id), [2, 1])
})

test('экраны «Актёры и режиссёры»: роль → живые/ушедшие → «Искать» → именинники', () => {
    const ids = (screen: any, extra: Record<string, unknown> = {}) =>
        renderWizard({...emptyState(), group: 'people', screen, ...extra}).keyboard.inline_keyboard.flat().map((button: any) => button.callback_data)
    assert.deepEqual(ids('people'), ['col:pr:actor', 'col:pr:director', 'col:b'])
    assert.deepEqual(ids('peopleLife', {personRole: 'actor'}), ['col:pl:alive', 'col:pl:dead', 'col:b'])
    assert.deepEqual(ids('peopleSearch', {personRole: 'actor', personLife: 'alive'}), ['col:ps', 'col:b'])
    const view = renderWizard({...emptyState(), group: 'people', screen: 'birthdays', personRole: 'actor', personLife: 'dead',
        birthdays: [
            {id: 20124, name: 'Джин Тирни', born: 1920, died: 1991, photo: 'file-tierney'},
            {id: 20125, name: 'Клифтон Уэбб', born: 1889, died: 1966}
        ]})
    // Кнопки-номера, как в подборках.
    assert.deepEqual((view.keyboard.inline_keyboard[0] as any[]).map(button => [button.text, button.callback_data]), [['1', 'col:pp:0'], ['2', 'col:pp:1']])
    assert.match(view.text, /актёры.*ушедшие/)
    assert.match(view.text, /1\. Джин Тирни<\/b> · 1920–1991/, 'запасной текст — имена строками')
    // Rich: список с «подробнее» — фото (если есть), роль и годы жизни.
    const list = view.rich().blocks.find((block: any) => block.type === 'list') as any
    assert.equal(list.items.length, 2)
    assert.deepEqual(list.items[0].blocks[0].text, ['1. ', {type: 'code', text: 'Джин Тирни'}])
    const details = list.items[0].blocks[1]
    assert.equal(details.type, 'details')
    assert.equal(details.blocks[0].photo.media, 'file-tierney')
    assert.deepEqual(details.blocks[1].text, ['#актёр · 🎂 1920–1991'])
    assert.equal(list.items[1].blocks[1].blocks[0].type, 'paragraph', 'без фото — только подпись')
    // Раздел в меню больше не «скоро».
    const root = renderWizard({...emptyState(), screen: 'root'}).keyboard.inline_keyboard.flat() as any[]
    assert.ok(root.some(button => button.callback_data === 'col:s:people' && !button.text.includes('скоро')))
})

test('именинники: имя «Фамилия, Имя Отчество» переставляется', () => {
    assert.equal(displayName('Озолиня, Лилита Арвидовна'), 'Лилита Арвидовна Озолиня')
    assert.equal(displayName('Джоди Фостер'), 'Джоди Фостер')
})

test('именинники: портрет из Wikidata — https и уменьшенная копия', () => {
    const [person] = parseBirthdays({results: {bindings: [{
        ...binding(1038, 'Джоди Фостер', '1962-11-19'),
        img: {value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Jodie%20Foster.jpg'}
    }]}})
    assert.equal(person?.image, 'https://commons.wikimedia.org/wiki/Special:FilePath/Jodie%20Foster.jpg?width=640')
})

test('кадры с актёром (Brave): постеры, вертикальные и мелкие отсеиваются, только оригиналы', async () => {
    const {pickStills, searchStills, stillQuery} = await import('#server/global/engine/collections/people/filmStills')
    assert.equal(stillQuery('Meg Ryan', 'When Harry Met Sally...', 1989), 'Meg Ryan When Harry Met Sally... 1989 movie still')
    assert.equal(stillQuery('Meg Ryan', 'Innerspace', 1987, 'Lydia Maxwell'), '"Meg Ryan" as Lydia Maxwell "Innerspace" 1987 film still')
    assert.equal(stillQuery('X', 'Film', 2000, 'Jane / Narrator (voice)'), '"X" as Jane "Film" 2000 film still')
    const urls = pickStills({results: [
        {title: 'When Harry Met Sally poster', properties: {url: 'https://a/poster.jpg', width: 1600, height: 900}, thumbnail: {src: 'https://proxy/1'}},
        {title: 'Meg Ryan portrait', properties: {url: 'https://a/tall.jpg', width: 800, height: 1200}, thumbnail: {src: 'https://proxy/2'}},
        {title: 'Unknown size', properties: {url: 'https://a/unknown.jpg'}, thumbnail: {src: 'https://proxy/3'}},
        {title: 'Meg Ryan in When Harry Met Sally', properties: {url: 'https://a/still.jpg', width: 1920, height: 1080}, thumbnail: {src: 'https://proxy/4'}},
        {title: 'Small still', properties: {url: 'https://a/small.jpg', width: 400, height: 225}, thumbnail: {src: 'https://proxy/5'}}
    ]})
    // Только оригиналы: крупные горизонтальные — первыми, неизвестного размера — в конце; мелкие и копии с прокси — нет.
    assert.deepEqual(urls, ['https://a/still.jpg', 'https://a/unknown.jpg'])

    let called = ''
    const fetchImpl = (async (url: string, init: RequestInit) => {
        called = `${url} ${(init.headers as Record<string, string>)['X-Subscription-Token']}`
        return Response.json({results: [{title: 'still', properties: {url: 'https://a/s.jpg', width: 1280, height: 720}, thumbnail: {src: 'https://proxy/s'}}]})
    }) as unknown as typeof fetch
    assert.deepEqual(await searchStills('Meg Ryan', 'Sleepless in Seattle', 1993, {key: 'k', fetchImpl}), ['https://a/s.jpg'])
    assert.match(called, /images\/search\?q=Meg\+Ryan\+Sleepless\+in\+Seattle\+1993\+movie\+still.* k$/)
    assert.deepEqual(await searchStills('Meg Ryan', 'X', 1993, {key: '', fetchImpl}), [], 'без ключа — не ищем')
})

test('кадры с актёром: фото с водяными знаками (eBay, фотобанки) пропускаются', async () => {
    const {pickStills} = await import('#server/global/engine/collections/people/filmStills')
    const urls = pickStills({results: [
        {title: 'Sleepless in Seattle press photo', properties: {url: 'https://i.ebayimg.com/images/g/x/s-l1600.jpg', width: 1600, height: 1200}, thumbnail: {src: 'https://proxy/e'}},
        {title: 'Meg Ryan', url: 'https://www.alamy.com/stock-photo', properties: {url: 'https://c7.alamy.com/x.jpg', width: 1300, height: 900}, thumbnail: {src: 'https://proxy/a'}},
        {title: 'Sleepless in Seattle', properties: {url: 'https://site/still.jpg', width: 1280, height: 720}, thumbnail: {src: 'https://proxy/s'}}
    ]})
    assert.deepEqual(urls, ['https://site/still.jpg'])
})

test('кадры с актёром: точный запрос с персонажем, пусто — второй, простой', async () => {
    const {searchStills} = await import('#server/global/engine/collections/people/filmStills')
    const queries: string[] = []
    const fetchImpl = (async (url: string) => {
        const q = new URL(url).searchParams.get('q')!
        queries.push(q)
        return Response.json({results: q.startsWith('"') ? [] : [{title: 'still', properties: {url: 'https://a/s.jpg', width: 1280, height: 720}}]})
    }) as unknown as typeof fetch
    assert.deepEqual(await searchStills('Meg Ryan', 'Innerspace', 1987, {key: 'k', fetchImpl, character: 'Lydia Maxwell'}), ['https://a/s.jpg'])
    assert.deepEqual(queries, ['"Meg Ryan" as Lydia Maxwell "Innerspace" 1987 film still', 'Meg Ryan Innerspace 1987 movie still'])
    queries.length = 0
    await searchStills('Meg Ryan', 'Innerspace', 1987, {key: 'k', fetchImpl})
    assert.equal(queries.length, 1, 'без персонажа — один запрос')
})

test('кадры с актёром: одного вида — только крупные горизонтальные, результат ровно 1280×720', async () => {
    const {acceptFrame, frameSize, normalizeStill} = await import('#server/global/engine/collections/people/normalizeStill')
    assert.deepEqual(frameSize('Stream #0:0: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 1920x1080 [SAR 1:1 DAR 16:9]'), {width: 1920, height: 1080})
    assert.equal(acceptFrame({width: 1920, height: 1080}), true)
    assert.equal(acceptFrame({width: 1440, height: 1080}), true, '4:3 — обрежется до 16:9')
    assert.equal(acceptFrame({width: 1000, height: 562}), false, 'мелкая — растянутая будет мыльной')
    assert.equal(acceptFrame({width: 1200, height: 1600}), false, 'вертикальная')
    assert.equal(acceptFrame({width: 3000, height: 1000}), false, 'слишком широкая полоса')

    // Настоящий ffmpeg: 2.39:1 1800×753 → 1280×720; 900×500 — отказ.
    const {spawnSync} = await import('node:child_process')
    const ffmpeg = (await import('ffmpeg-static')).default as unknown as string
    const make = (size: string) => spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=size=${size}`, '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1']).stdout as Buffer
    const out = await normalizeStill(make('1800x753'))
    assert.ok(out, 'широкий кадр принят')
    const probe = spawnSync(ffmpeg, ['-hide_banner', '-i', 'pipe:0'], {input: out}).stderr.toString()
    assert.deepEqual(frameSize(probe), {width: 1280, height: 720})
    assert.equal(await normalizeStill(make('900x500')), undefined)
})

test('кадры с актёром: ни одна картинка точного запроса не подошла — простой запрос', async () => {
    const {findStill} = await import('#server/global/engine/collections/people/filmStills')
    const queries: string[] = []
    const fetchImpl = (async (url: string) => {
        const q = new URL(url).searchParams.get('q')!
        queries.push(q)
        return Response.json({results: [{title: 'still', properties: {url: q.startsWith('"') ? 'https://a/small.jpg' : 'https://a/big.jpg', width: 1920, height: 1080}}]})
    }) as unknown as typeof fetch
    const found = await findStill('Meg Ryan', 'French Kiss', 1995, async urls => urls[0] === 'https://a/big.jpg' ? 'file-big' : undefined, {key: 'k', fetchImpl, character: 'Kate'})
    assert.equal(found, 'file-big')
    assert.equal(queries.length, 2)
})

test('именинники: пустой список ушедших объясняет порог по году смерти', () => {
    const texts = (life: string) => renderWizard({...emptyState(), group: 'people', screen: 'birthdays', personRole: 'actor', personLife: life as any, birthdays: []})
        .keyboard.inline_keyboard.flat().map((button: any) => button.text)
    assert.ok(texts('dead').includes('Сегодня никого (ушедшие с 2015 года)'))
    assert.ok(texts('alive').includes('Сегодня никого не нашлось'))
})

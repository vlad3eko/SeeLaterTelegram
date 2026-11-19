import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bundleByKey, rubricOf} from '#server/global/engine/collections/bundles'
import type {Dossier} from '#server/global/engine/collections/judge/dossier'
import {headTail, stripWikitext} from '#server/global/engine/collections/judge/dossier'
import {buildJudgePrompt, judgeTitle, parseAnswer, quoteFound, verifyAnswer} from '#server/global/engine/collections/judge/judge'
import {checkControls, pickBundles, runBundle, runScheduled, type TitleRef} from '#server/global/engine/collections/judge/run'
import {MemoryBundleStore, SupabaseBundleStore, type VerdictRow} from '#server/global/engine/collections/judge/store'
import {availableBundles} from '#server/global/engine/collections/buildCollection'
import {setBundleStore} from '#server/global/engine/collections/judge/store'
import {bundleTables, fakeSupabase} from '#server/global/engine/collections/tests/fakeSupabase'

const twist = bundleByKey('twist')!
const rubric = rubricOf(twist)

const PLOT = 'В финале выясняется, что Малкольм всё это время был мёртв и сам является одним из призраков, которых видит мальчик.'

const dossierOf = (id: number, plot = PLOT): Dossier => ({
    mediaType: 'movie',
    id,
    title: `Фильм ${id}`,
    originalTitle: `Movie ${id}`,
    year: 1999,
    sources: [
        {id: 'tmdb_overview_ru', label: 'TMDB: описание (ru)', text: 'Детский психолог берётся помочь мальчику, который утверждает, что видит мёртвых людей.'},
        ...(plot ? [{id: 'wiki_ru_plot', label: 'Википедия (ru): сюжет', text: plot}] : [])
    ]
})

const answer = (verdict: string, scores: number[], quote = 'выясняется, что Малкольм всё это время был мёртв', extra: Record<string, unknown> = {}) => JSON.stringify({
    verdict,
    criteria: rubric.criteria.map((criterion, index) => ({key: criterion.key, score: scores[index] ?? 0, quote: scores[index] ? quote : '', source: 'wiki_ru_plot'})),
    exclusion: '',
    reason: 'Поворот в финале меняет смысл истории.',
    reason_codes: ['late_reveal'],
    missing: [],
    confidence: 0.9,
    ...extra
})

/* ------------------------------------ Судья ------------------------------------ */

test('цитаты: дословно, с другими кавычками и регистром, склейка через многоточие', () => {
    assert.ok(quoteFound('выясняется, что Малкольм всё это время был мёртв', PLOT))
    assert.ok(quoteFound('ВЫЯСНЯЕТСЯ, ЧТО МАЛКОЛЬМ ВСЕ ЭТО ВРЕМЯ БЫЛ МЕРТВ', PLOT), 'ё/е и регистр')
    assert.ok(quoteFound('В финале выясняется, что Малкольм … является одним из призраков, которых видит', PLOT))
    assert.ok(!quoteFound('Малкольм был жив и уехал в отпуск с семьёй', PLOT), 'выдуманная цитата')
    assert.ok(!quoteFound('был мёртв', PLOT), 'слишком короткая цитата не подтверждение')
})

test('цитаты из живого прогона 19.11: мелкие правки модели проходят, выдумка — нет', () => {
    const others = 'Мальчик Виктор и прочие «призраки» — это на самом деле живая семья Марлиш, которая въехала в дом после смерти Стюартов. Слепая же старуха является медиумом, которую пригласили для установления контакта.'
    assert.ok(quoteFound('Мальчик Виктор и прочие «призраки» — это на самом деле живая семья Марлиш, которые въехала в дом после смерти Стюартов. Слепая же старуха является медиумом', others))
    const getOut = 'Видео, которое он просматривает по телевизору, объясняет метод псевдобессмертия семьи, при котором Дин переносит мозги своих пожилых друзей в тела более молодых темнокожих людей, выбранных Роуз и гипнотически обработанных Мисси.'
    assert.ok(quoteFound('в котором Дин переносит мозги своих пожилых друзей в тела более молодых темнокожих людей, выбранных Роуз и гипнотически обработанных Мисси', getOut))
    const island = 'Все происходящие на острове события были инсценировкой, призванной вырвать Эндрю из его выдуманного мира в настоящий. Позже выясняется, что «напарник Чак Оул» был лечащим врачом Эндрю — доктором Лестером Шином.'
    assert.ok(quoteFound('Все происходящие на острове события были инсценировкой, призванной вырвать Эндрю из его выдуманного мира в настоящий. […] «Напарник Чак Оул» был лечащим врачом Эндрю — доктором Лестером Шином.', island))
    assert.ok(!quoteFound('Дин оказывается инопланетянином, который прилетел за Крисом на космическом корабле', getOut))
})

test('досье: длинный сюжет — начало и конец (финал важнее середины)', () => {
    const text = `Начало истории. ${'Середина. '.repeat(2000)}Финал: герой был мёртв.`
    const cut = headTail(text, 300, 600)
    assert.ok(cut.startsWith('Начало истории.'))
    assert.ok(cut.endsWith('Финал: герой был мёртв.'))
    assert.ok(cut.includes('[…]'))
    assert.ok(cut.length < 1000)
    assert.equal(headTail('коротко', 300, 600), 'коротко')
})

test('разбор ответа: JSON в ```json, мусор вокруг, неверный вердикт', () => {
    const parsed = parseAnswer('Вот ответ:\n```json\n' + answer('yes', [2, 2, 2]) + '\n```')
    assert.equal(parsed?.verdict, 'yes')
    assert.equal(parsed?.criteria.length, 3)
    assert.equal(parseAnswer('{"verdict":"maybe"}'), null)
    assert.equal(parseAnswer('не JSON'), null)
    // Баллы приводятся к 0…2.
    assert.equal(parseAnswer(answer('yes', [5, -1, 2]))?.criteria[0]?.score, 2)
})

test('проверка: подтверждённые цитаты дают «да»', () => {
    const outcome = verifyAnswer(parseAnswer(answer('yes', [2, 2, 2]))!, rubric, dossierOf(1))
    assert.equal(outcome.verdict, 'yes')
    assert.equal(outcome.score, 6)
    assert.ok(outcome.evidence.every(item => item.verified))
    assert.deepEqual(outcome.corrections, [])
})

test('проверка: выдуманные цитаты обнуляются, «да» без подтверждения → insufficient', () => {
    const outcome = verifyAnswer(parseAnswer(answer('yes', [2, 2, 2], 'герой просыпается и понимает, что всё было сном'))!, rubric, dossierOf(1))
    assert.equal(outcome.score, 0)
    assert.equal(outcome.verdict, 'insufficient')
    assert.ok(outcome.corrections.some(text => text.includes('цитата не найдена')))
})

test('проверка: модель завысила вердикт — пересчёт по порогам рубрики', () => {
    const outcome = verifyAnswer(parseAnswer(answer('yes', [2, 1, 0]))!, rubric, dossierOf(1))
    assert.equal(outcome.score, 3)
    assert.equal(outcome.verdict, 'borderline')
})

test('проверка: источник указан неверно — цитата ищется во всём досье', () => {
    const raw = JSON.parse(answer('yes', [2, 2, 2]))
    raw.criteria = raw.criteria.map((item: any) => ({...item, source: 'tmdb_overview_ru'}))
    const outcome = verifyAnswer(parseAnswer(JSON.stringify(raw))!, rubric, dossierOf(1))
    assert.equal(outcome.verdict, 'yes')
    assert.ok(outcome.evidence.every(item => item.source === 'wiki_ru_plot'))
})

test('промпт: рубрика, правила, досье как данные в границах', () => {
    const prompt = buildJudgePrompt(twist, rubric, dossierOf(1))
    assert.ok(prompt.includes('late_reveal'))
    assert.ok(prompt.includes('НЕ используй') || prompt.includes('Не используй'))
    assert.ok(prompt.includes('=== ДОСЬЕ'))
    assert.ok(prompt.includes('источник id=wiki_ru_plot'))
    assert.ok(prompt.indexOf('ПРАВИЛА') < prompt.indexOf('=== ДОСЬЕ'))
})

test('судья: неразборчивый ответ дважды — insufficient', async () => {
    let calls = 0
    const outcome = await judgeTitle(twist, rubric, dossierOf(1), async () => {
        calls++
        return {text: 'извините, не могу', model: 'stub'}
    })
    assert.equal(calls, 2)
    assert.equal(outcome.verdict, 'insufficient')
})

test('вики-разметка → текст', () => {
    const text = stripWikitext("'''Малкольм''' встречает [[Коул Сир|Коула]]<ref>Источник</ref>{{нп|x}} и [[призрак]]ов.")
    assert.equal(text, 'Малкольм встречает Коула и призраков.')
})

/* ------------------- Расчёт с воображаемыми таблицами Supabase ------------------- */

/** Модель-заглушка: «да» для id из списка, иначе «нет» (цитата из досье, чтобы прошла проверку). */
const stubModel = (yesIds: Set<number>) => async (prompt: string) => {
    const id = Number(/ДОСЬЕ: Фильм (\d+)/.exec(prompt)?.[1])
    return {text: yesIds.has(id) ? answer('yes', [2, 2, 2]) : answer('no', [0, 0, 0]), model: 'stub-model'}
}

const twistDeps = (store: SupabaseBundleStore | MemoryBundleStore, yesIds: number[], candidates: number[]) => {
    const calls = {dossier: 0, ask: 0}
    const ask = stubModel(new Set(yesIds))
    return {
        calls,
        deps: {
            store,
            ask: async (prompt: string) => {
                calls.ask++
                return ask(prompt)
            },
            dossier: async (_mediaType: 'movie' | 'tv', id: number) => {
                calls.dossier++
                return dossierOf(id)
            },
            candidates: async (): Promise<TitleRef[]> => candidates.map(id => ({mediaType: 'movie' as const, id})),
            snapshot: async (_mediaType: 'movie' | 'tv', id: number) => ({
                title: `Фильм ${id}`, date: '2001-01-01', voteAverage: 7.5, voteCount: 5000, popularity: 30, genreIds: [53], shelf: 'movie'
            }),
            readyList: async () => [],
            log: () => undefined
        }
    }
}

test('расчёт связки в воображаемом Supabase: вердикты, контроль, кэш, досье', async () => {
    const tables = bundleTables()
    const store = new SupabaseBundleStore(fakeSupabase(tables) as never)
    const positives = twist.controls!.positive.map(ref => ref.id)
    const negatives = twist.controls!.negative.map(ref => ref.id)
    const {deps, calls} = twistDeps(store, [...positives, 101, 102], [101, 102, 103])

    const run = await runBundle(twist, deps, {limit: 10})
    assert.equal(run.status, 'done')
    assert.equal((run.stats as any).publishable, true)
    assert.equal(tables.collection_bundle_verdicts!.length, positives.length + negatives.length + 3)
    assert.equal(tables.collection_bundle_dossiers!.length, positives.length + negatives.length + 3)
    assert.equal(tables.collection_bundle_runs!.length, 1)
    const yes = tables.collection_bundle_verdicts!.filter(row => row.verdict === 'yes').map(row => row.media_id)
    assert.ok(yes.includes(101) && !yes.includes(103))
    // Контрольные отрицательные — не «да».
    assert.ok(negatives.every(id => !yes.includes(id)))

    // Второй расчёт той же версии рубрики: всё из кэша — модель и досье не вызываются.
    const before = {...calls}
    const again = await runBundle(twist, deps, {limit: 10})
    assert.equal(again.status, 'done')
    assert.equal(calls.ask, before.ask)
    assert.equal(calls.dossier, before.dossier)
    assert.equal(tables.collection_bundle_runs!.length, 2)
})

test('контрольные тайтлы провалены — связка не публикуется и бот её не показывает', async () => {
    const tables = bundleTables()
    const store = new SupabaseBundleStore(fakeSupabase(tables) as never)
    const positives = twist.controls!.positive.map(ref => ref.id)
    const negatives = twist.controls!.negative.map(ref => ref.id)
    // Судья «ошибается»: говорит «да» трудному отрицательному.
    const many = Array.from({length: 8}, (_, index) => 200 + index)
    const {deps} = twistDeps(store, [...positives, negatives[0]!, ...many], many)
    const run = await runBundle(twist, deps, {limit: 20})
    assert.equal((run.stats as any).publishable, false)
    assert.ok((run.stats as any).controls.failures.some((failure: string) => failure.startsWith('-movie:')))
    assert.deepEqual(run.items, [])

    setBundleStore(store)
    try {
        assert.ok(!(await availableBundles('movie', 'movies')).some(bundle => bundle.key === 'twist'))
    } finally {
        setBundleStore(undefined)
    }
})

test('судимая связка видна в мастере, когда «да» набралось на подборку', async () => {
    const store = new MemoryBundleStore()
    const row = (id: number, verdict: VerdictRow['verdict']): VerdictRow => ({
        bundle_key: 'twist', media_type: 'movie', media_id: id, rubric_version: rubric.version, verdict, score: 6, confidence: 0.9,
        reason: '', reason_codes: [], evidence: [], missing: [], sources: [], model: 'stub', judged_at: new Date().toISOString(),
        snapshot: {title: `Фильм ${id}`, voteAverage: 7, voteCount: 1000, popularity: 10, genreIds: [53], shelf: 'movie'}
    })
    setBundleStore(store)
    try {
        assert.ok(!(await availableBundles('movie', 'movies')).some(bundle => bundle.key === 'twist'), 'вердиктов нет — скрыта')
        await store.saveVerdicts([1, 2, 3, 4, 5].map(id => row(id, 'yes')))
        assert.ok(!(await availableBundles('movie', 'movies')).some(bundle => bundle.key === 'twist'), '5 < minResults')
        await store.saveVerdicts([row(6, 'yes')])
        assert.ok((await availableBundles('movie', 'movies')).some(bundle => bundle.key === 'twist'))
        // Автоматические связки видны всегда.
        assert.ok((await availableBundles('movie', 'movies')).some(bundle => bundle.key === 'survival'))
        // На полке сериалов «да» фильмов не считаются.
        assert.ok(!(await availableBundles('series', 'series_completed')).some(bundle => bundle.key === 'twist'))
    } finally {
        setBundleStore(undefined)
    }
})

test('экран связок: проработанные судьёй сверху (reviewed), «сырые» ниже', async () => {
    const store = new MemoryBundleStore()
    await store.saveRun({bundle_key: 'con', status: 'done', finished_at: '2026-11-18T00:00:00Z', stats: {publishable: true}, items: []})
    await store.saveRun({bundle_key: 'whodunit', status: 'done', finished_at: '2026-11-19T00:00:00Z', stats: {publishable: true}, items: []})
    // Упавший расчёт не делает связку проработанной.
    await store.saveRun({bundle_key: 'epidemic', status: 'failed', finished_at: '2026-11-19T00:00:00Z', stats: {}, items: []})
    setBundleStore(store)
    try {
        const shown = await availableBundles('movie', 'movies')
        assert.deepEqual(shown.slice(0, 2).map(bundle => [bundle.key, bundle.reviewed]), [['whodunit', true], ['con', true]])
        assert.ok(shown.slice(2).every(bundle => !bundle.reviewed))
        assert.equal(shown[2]?.key, 'survival', 'сырые — в порядке справочника')
    } finally {
        setBundleStore(undefined)
    }
})

test('выбор связок: сначала не считавшиеся судимые, затем автоматические, затем самые давние', async () => {
    const store = new MemoryBundleStore()
    const first = await pickBundles(store, 2)
    assert.deepEqual(first.map(bundle => bundle.key), ['twist', 'sad_end'])
    const judgedKeys = ['twist', 'sad_end', 'tearjerker', 'feelgood', 'adult_animation']
    for (const [index, key] of judgedKeys.entries()) {
        await store.saveRun({bundle_key: key, status: 'done', finished_at: `2026-11-0${index + 1}T00:00:00Z`, stats: {}, items: []})
    }
    await store.saveRun({bundle_key: 'survival', status: 'done', finished_at: '2026-11-10T00:00:00Z', stats: {}, items: []})
    assert.deepEqual((await pickBundles(store, 2)).map(bundle => bundle.key), ['whodunit', 'time_loop'])
    // Все считались — самые давние.
    const allStore = new MemoryBundleStore()
    await allStore.saveRun({bundle_key: 'twist', status: 'done', finished_at: '2026-11-01T00:00:00Z', stats: {}, items: []})
    await allStore.saveRun({bundle_key: 'survival', status: 'done', finished_at: '2026-10-01T00:00:00Z', stats: {}, items: []})
    assert.deepEqual((await pickBundles(allStore, 2, ['twist', 'survival'])).map(bundle => bundle.key), ['survival', 'twist'])
    // Упавший расчёт не считается: связка остаётся в очереди.
    const failedStore = new MemoryBundleStore()
    await failedStore.saveRun({bundle_key: 'twist', status: 'failed', finished_at: '2026-11-18T00:00:00Z', stats: {}, items: []})
    assert.equal((await pickBundles(failedStore, 1))[0]?.key, 'twist')
})

test('плановый запуск: ровно 2 связки за раз', async () => {
    const store = new MemoryBundleStore()
    const {deps} = twistDeps(store, [], [])
    const runs = await runScheduled({...deps, store}, {count: 2})
    assert.equal(runs.length, 2)
    assert.deepEqual(runs.map(run => run.bundle_key), ['twist', 'sad_end'])
    assert.equal((await store.runs()).filter(run => run.status === 'done').length, 2)
})

test('нет таблиц в Supabase — ошибка «нет таблицы», хранилище распознаёт', async () => {
    const store = new SupabaseBundleStore(fakeSupabase({}) as never)
    await assert.rejects(() => store.runs(), /schema cache/)
})

test('контроль: 3 из 4 положительных достаточно, одно «да» отрицательному — провал', () => {
    const verdicts = new Map<string, VerdictRow>()
    const put = (id: number, verdict: VerdictRow['verdict']) =>
        verdicts.set(`movie:${id}`, {verdict} as VerdictRow)
    const [p1, p2, p3, p4] = twist.controls!.positive.map(ref => ref.id)
    put(p1!, 'yes'); put(p2!, 'yes'); put(p3!, 'yes'); put(p4!, 'insufficient')
    assert.equal(checkControls(twist, verdicts).passed, true)
    put(twist.controls!.negative[0]!.id, 'yes')
    assert.equal(checkControls(twist, verdicts).passed, false)
})

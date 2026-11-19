import {
    type Bundle,
    bundleSections,
    BUNDLES,
    rubricOf
} from '#server/global/engine/collections/bundles'
import {buildCollection, type Candidate, collectCandidates} from '#server/global/engine/collections/buildCollection'
import type {SectionKey} from '#server/global/engine/collections/catalog'
import {type MediaType, SHELVES, type ShelfKey, shelfOf} from '#server/global/engine/collections/shelves'
import {mapLimit, tmdbGet} from '#server/global/engine/collections/tmdb'
import {buildDossier, type Dossier} from '#server/global/engine/collections/judge/dossier'
import {type AskModel, judgeTitle} from '#server/global/engine/collections/judge/judge'
import type {BundleStore, RunItem, RunRow, TitleSnapshot, VerdictRow} from '#server/global/engine/collections/judge/store'

/**
 * Расчёт связок (ТЗ, пункт 3; решение владельца 19.11): не пересчитывать всё, а 2 раза в неделю
 * брать 2 связки, которые дольше всех не считались, и:
 *   1. собрать кандидатов (discover по правилам связки на каждой её полке + «Похожее» от якорей
 *      + контрольные тайтлы);
 *   2. пропустить уже судимых по текущей версии рубрики (кэш вердиктов);
 *   3. досье (кэш в хранилище) → судья → вердикты в хранилище;
 *   4. контрольные тайтлы: положительные должны пройти, «трудные отрицательные» — нет;
 *      провал — связка не публикуется (бот её не показывает), вердикты всё равно сохраняются;
 *   5. готовый список по каждой полке (с трейлерами) — в запись расчёта, для показа и публикации.
 * Все внешние зависимости подставляются (тесты — воображаемое хранилище и модель-заглушка).
 */

type Raw = Record<string, any>

export type TitleRef = {mediaType: MediaType, id: number, snapshot?: TitleSnapshot}

export type RunDeps = {
    store: BundleStore
    ask: AskModel
    dossier?: (mediaType: MediaType, id: number) => Promise<Dossier>
    candidates?: (bundle: Bundle, perShelf: number) => Promise<TitleRef[]>
    snapshot?: (mediaType: MediaType, id: number) => Promise<TitleSnapshot>
    readyList?: (bundle: Bundle) => Promise<RunItem[]>
    now?: () => Date
    log?: (message: string) => void
}

export type RunOptions = {
    /** Сколько новых тайтлов судить за связку (кэш не считается). */
    limit?: number
    /** Судить заново, даже если вердикт по этой версии рубрики уже есть. */
    rejudge?: boolean
    /** Досье старше стольких дней собираются заново. */
    dossierMaxAgeDays?: number
}

const refKey = (ref: {mediaType: string, id: number}) => `${ref.mediaType}:${ref.id}`

/** Снимок тайтла из выдачи discover / карточки TMDB. */
export const snapshotOf = (item: Raw, mediaType: MediaType): TitleSnapshot => ({
    title: String(item.title || item.name || ''),
    originalTitle: String(item.original_title || item.original_name || ''),
    date: String(item.release_date || item.first_air_date || ''),
    voteAverage: Number(item.vote_average) || 0,
    voteCount: Number(item.vote_count) || 0,
    popularity: Number(item.popularity) || 0,
    genreIds: ((item.genre_ids ?? (item.genres ?? []).map((genre: Raw) => genre.id)) as number[]).map(Number),
    originCountry: [
        ...(item.origin_country ?? []),
        ...((item.production_countries ?? []) as Raw[]).map(country => country.iso_3166_1)
    ].filter((code, index, list) => typeof code === 'string' && list.indexOf(code) === index),
    originalLanguage: String(item.original_language ?? ''),
    shelf: shelfOf(item, mediaType)
})

const tmdbSnapshot = async (mediaType: MediaType, id: number) =>
    snapshotOf(await tmdbGet<Raw>(`${mediaType}/${id}?language=ru-RU`), mediaType)

/** Раздел для отбора кандидатов на полке: «уже вышли» / «вышли полностью», если связка там есть. */
const judgeSection = (bundle: Bundle, shelf: ShelfKey): SectionKey | undefined => {
    const sections = bundleSections(bundle)
    const preferred: SectionKey = SHELVES[shelf].mediaType === 'movie' ? 'movies' : 'series_completed'
    if (sections.includes(preferred)) return preferred
    return undefined
}

/** Кандидаты по умолчанию: discover по правилам на каждой полке + рекомендации к якорям. */
export const defaultCandidates = async (bundle: Bundle, perShelf: number): Promise<TitleRef[]> => {
    const refs: TitleRef[] = []
    for (const shelf of bundle.shelves) {
        const section = judgeSection(bundle, shelf)
        if (!section) continue
        try {
            const {candidates} = await collectCandidates(
                {section, criterion: 'bundle', bundle: bundle.key, shelf, period: 'all'},
                [],
                {ignoreVerdicts: true}
            )
            // Сначала известные: суд дорогой, а в подборку всё равно идут тайтлы с голосами.
            const top = [...candidates]
                .sort((a: Candidate, b: Candidate) => (Number(b.item.vote_count) || 0) - (Number(a.item.vote_count) || 0))
                .slice(0, perShelf)
            refs.push(...top.map(candidate => ({
                mediaType: SHELVES[shelf].mediaType,
                id: Number(candidate.item.id),
                snapshot: snapshotOf({...candidate.details, ...candidate.item}, SHELVES[shelf].mediaType)
            })))
        } catch (error) {
            console.warn('[BUNDLES] Candidates failed', bundle.key, shelf, error instanceof Error ? error.message : error)
        }
    }

    // «Похожее» от якорей: находит то, что ключевыми словами не размечено (финалы, эмоции).
    for (const anchor of bundle.anchors ?? []) {
        try {
            const body = await tmdbGet<{results?: Raw[]}>(`${anchor.mediaType}/${anchor.id}/recommendations?language=ru-RU&page=1`)
            for (const item of (body.results ?? []).slice(0, 8)) {
                const shelf = shelfOf(item, anchor.mediaType)
                if (!bundle.shelves.includes(shelf) || (Number(item.vote_count) || 0) < SHELVES[shelf].knownVotes) continue
                refs.push({mediaType: anchor.mediaType, id: Number(item.id), snapshot: snapshotOf(item, anchor.mediaType)})
            }
            refs.push({mediaType: anchor.mediaType, id: anchor.id})
        } catch (error) {
            console.warn('[BUNDLES] Anchor recommendations failed', bundle.key, anchor.id, error instanceof Error ? error.message : error)
        }
    }
    return refs
}

/** Готовый список по умолчанию: сборка подборки на каждой полке за всё время (вердикты уже в хранилище). */
export const defaultReadyList = async (bundle: Bundle): Promise<RunItem[]> => {
    const items: RunItem[] = []
    for (const shelf of bundle.shelves) {
        const section = judgeSection(bundle, shelf)
        if (!section) continue
        try {
            const result = await buildCollection({section, criterion: 'bundle', bundle: bundle.key, shelf, period: 'all'})
            items.push(...result.items.map(item => ({
                shelf,
                media_type: item.mediaType,
                id: item.id,
                title: item.title,
                score: Number(item.score.toFixed(4)),
                trailer_key: item.trailer.key,
                trailer_language: item.trailer.language
            })))
        } catch (error) {
            console.warn('[BUNDLES] Ready list failed', bundle.key, shelf, error instanceof Error ? error.message : error)
        }
    }
    return items
}

/** Связки, которые дольше всех не считались (никогда — первыми; при равенстве — по справочнику). */
export const pickBundles = async (store: BundleStore, count: number, only?: string[]): Promise<Bundle[]> => {
    const runs = await store.runs()
    const lastRun = new Map<string, string>()
    for (const run of runs) {
        if (run.status === 'failed') continue
        const at = run.finished_at ?? run.created_at
        if (!lastRun.has(run.bundle_key) || at > lastRun.get(run.bundle_key)!) lastRun.set(run.bundle_key, at)
    }
    const pool = only?.length ? BUNDLES.filter(bundle => only.includes(bundle.key)) : BUNDLES
    return [...pool]
        .map((bundle, index) => ({bundle, index, at: lastRun.get(bundle.key) ?? ''}))
        .sort((a, b) => a.at.localeCompare(b.at) || a.index - b.index)
        .slice(0, count)
        .map(entry => entry.bundle)
}

/** Контрольные тайтлы: положительные — не меньше 75 % «да», отрицательные — ни одного «да». */
export const checkControls = (bundle: Bundle, verdicts: Map<string, VerdictRow>) => {
    const positive = bundle.controls?.positive ?? []
    const negative = bundle.controls?.negative ?? []
    const failures: string[] = []
    let positiveYes = 0
    for (const ref of positive) {
        const row = verdicts.get(refKey(ref))
        if (row?.verdict === 'yes') positiveYes++
        else failures.push(`+${refKey(ref)}: ${row?.verdict ?? 'нет вердикта'}`)
    }
    for (const ref of negative) {
        const row = verdicts.get(refKey(ref))
        if (row?.verdict === 'yes') failures.push(`-${refKey(ref)}: yes`)
    }
    const positiveOk = !positive.length || positiveYes / positive.length >= 0.75
    const negativeOk = !failures.some(failure => failure.startsWith('-'))
    return {passed: positiveOk && negativeOk, positiveYes, positiveTotal: positive.length, negativeTotal: negative.length, failures}
}

/** Расчёт одной связки. */
export const runBundle = async (bundle: Bundle, deps: RunDeps, options: RunOptions = {}): Promise<RunRow> => {
    const {store, ask} = deps
    const now = deps.now ?? (() => new Date())
    const log = deps.log ?? ((message: string) => console.log(message))
    const limit = options.limit ?? 60
    const rubric = rubricOf(bundle)
    const startedAt = now().toISOString()

    let run = await store.saveRun({bundle_key: bundle.key, status: 'running', started_at: startedAt, stats: {}, items: []})
    try {
        // 1. Кандидаты: контрольные — всегда, остальные — по правилам и якорям.
        const controls: TitleRef[] = [...(bundle.controls?.positive ?? []), ...(bundle.controls?.negative ?? [])]
        const perShelf = Math.max(10, Math.ceil(limit * 1.5 / Math.max(1, bundle.shelves.length)))
        const found = await (deps.candidates ?? defaultCandidates)(bundle, perShelf)
        const unique = new Map<string, TitleRef>()
        for (const ref of [...controls, ...found]) if (!unique.has(refKey(ref))) unique.set(refKey(ref), ref)

        // 2. Кэш вердиктов по текущей версии рубрики.
        const existing = new Map((await store.verdicts(bundle.key, rubric.version)).map(row => [refKey({mediaType: row.media_type, id: Number(row.media_id)}), row]))
        const controlKeys = new Set(controls.map(refKey))
        const fresh = [...unique.values()].filter(ref => options.rejudge || !existing.has(refKey(ref)))
        // Контрольные — вне лимита: без них связку нельзя проверить.
        const toJudge = [...fresh.filter(ref => controlKeys.has(refKey(ref))), ...fresh.filter(ref => !controlKeys.has(refKey(ref))).slice(0, limit)]
        log(`[BUNDLES] ${bundle.key}: кандидатов ${unique.size}, в кэше ${unique.size - fresh.length}, судим ${toJudge.length}`)

        // 3. Досье (кэш) → судья.
        const cachedDossiers = new Map((await store.dossiers(toJudge.map(ref => ({media_type: ref.mediaType, media_id: ref.id}))))
            .filter(row => Date.now() - Date.parse(row.fetched_at) < (options.dossierMaxAgeDays ?? 90) * 864e5)
            .map(row => [refKey({mediaType: row.media_type, id: Number(row.media_id)}), row.sources as unknown as Dossier]))
        const buildDossierFor = deps.dossier ?? ((mediaType: MediaType, id: number) => buildDossier(mediaType, id))
        const snapshotFor = deps.snapshot ?? tmdbSnapshot

        const judged = await mapLimit(toJudge, 3, async (ref): Promise<VerdictRow | null> => {
            try {
                let dossier = cachedDossiers.get(refKey(ref))
                if (!dossier?.sources?.length) {
                    dossier = await buildDossierFor(ref.mediaType, ref.id)
                    await store.saveDossiers([{media_type: ref.mediaType, media_id: ref.id, sources: dossier as never, fetched_at: now().toISOString()}])
                }
                const snapshot = ref.snapshot ?? await snapshotFor(ref.mediaType, ref.id)
                const outcome = await judgeTitle(bundle, rubric, dossier, ask).catch(error => {
                    // Модель отказалась принять досье (фильтр безопасности Gemini, проверено на «Форресте Гампе»):
                    // запоминаем «нет данных», чтобы не повторять запрос каждый расчёт.
                    const message = error instanceof Error ? error.message : String(error)
                    if (!/input blocked|prohibited use|safety/i.test(message)) throw error
                    return {
                        verdict: 'insufficient' as const, score: 0, confidence: 0, reason: 'Модель отклонила досье (фильтр безопасности).',
                        reasonCodes: ['blocked'], evidence: [], missing: [], sources: dossier!.sources.map(source => source.id), corrections: [], model: ''
                    }
                })
                const row: VerdictRow = {
                    bundle_key: bundle.key,
                    media_type: ref.mediaType,
                    media_id: ref.id,
                    rubric_version: rubric.version,
                    verdict: outcome.verdict,
                    score: outcome.score,
                    confidence: outcome.confidence,
                    reason: outcome.reason,
                    reason_codes: [...outcome.reasonCodes, ...(outcome.corrections.length ? ['corrected'] : [])],
                    evidence: outcome.evidence,
                    missing: outcome.missing,
                    sources: outcome.sources,
                    snapshot,
                    model: outcome.model,
                    judged_at: now().toISOString()
                }
                await store.saveVerdicts([row])
                log(`  ${row.verdict.padEnd(12)} ${row.score} ${snapshot.title}${outcome.corrections.length ? `  (${outcome.corrections.join('; ')})` : ''}`)
                return row
            } catch (error) {
                log(`  error        ${refKey(ref)}: ${error instanceof Error ? error.message : error}`)
                return null
            }
        })

        // 4. Контрольные тайтлы.
        const all = new Map(existing)
        for (const row of judged) if (row) all.set(refKey({mediaType: row.media_type, id: row.media_id}), row)
        const controlCheck = checkControls(bundle, all)
        const counts = {yes: 0, borderline: 0, no: 0, insufficient: 0}
        for (const row of all.values()) counts[row.verdict]++

        // 5. Готовый список (если связку можно публиковать).
        const items = controlCheck.passed ? await (deps.readyList ?? defaultReadyList)(bundle) : []
        const stats = {
            rubric_version: rubric.version,
            candidates: unique.size,
            judged_now: judged.filter(Boolean).length,
            errors: judged.filter(row => !row).length,
            verdicts: counts,
            controls: controlCheck,
            publishable: controlCheck.passed,
            ready: items.length
        }
        run = await store.saveRun({...run, status: 'done', finished_at: now().toISOString(), stats, items})
        log(`[BUNDLES] ${bundle.key}: ${JSON.stringify(counts)}, контроль ${controlCheck.passed ? 'пройден' : `провален (${controlCheck.failures.join(', ')})`}, в списке ${items.length}`)
        return run
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        run = await store.saveRun({...run, status: 'failed', finished_at: now().toISOString(), error: message})
        log(`[BUNDLES] ${bundle.key}: ошибка ${message}`)
        return run
    }
}

/** Плановый запуск: count связок, которые дольше всех не считались. */
export const runScheduled = async (deps: RunDeps, {count = 2, only, ...options}: RunOptions & {count?: number, only?: string[]} = {}) => {
    const bundles = await pickBundles(deps.store, count, only)
    const runs: RunRow[] = []
    for (const bundle of bundles) runs.push(await runBundle(bundle, deps, options))
    return runs
}

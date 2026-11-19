import fs from 'node:fs'
import path from 'node:path'
import {createClient, type SupabaseClient} from '@supabase/supabase-js'
import type {MediaType} from '#server/global/engine/collections/shelves'

/**
 * Хранилище судьи связок: вердикты (тайтл × связка × версия рубрики), расчёты (очередь и готовый
 * результат) и досье (кэш источников, чтобы не ходить в Википедию повторно).
 *
 * Таблицы — database/migrations/collection_bundles.sql. Пока их нет (до миграции владельцем),
 * вне production вердикты читаются из локального файла .bundles-store.json (FileBundleStore),
 * без него — пусто: судимые связки скрыты, автоматические работают без фильтра судьи.
 * Тесты подставляют MemoryBundleStore.
 */

export type Verdict = 'yes' | 'borderline' | 'no' | 'insufficient'

export type Evidence = {criterion: string, source: string, quote: string, verified?: boolean}

/** Снимок тайтла на момент суда: хватает, чтобы собрать подборку без запросов к TMDB. */
export type TitleSnapshot = {
    title: string
    originalTitle?: string
    date?: string
    voteAverage: number
    voteCount: number
    popularity: number
    genreIds: number[]
    originCountry?: string[]
    originalLanguage?: string
    shelf?: string
}

export type VerdictRow = {
    bundle_key: string
    media_type: MediaType
    media_id: number
    rubric_version: number
    verdict: Verdict
    score: number
    confidence: number
    reason: string
    reason_codes: string[]
    evidence: Evidence[]
    missing: string[]
    sources: string[]
    snapshot: TitleSnapshot
    model: string
    judged_at: string
}

export type RunStatus = 'queued' | 'running' | 'done' | 'failed'

export type RunItem = {shelf: string, media_type: MediaType, id: number, title: string, score: number, trailer_key: string, trailer_language: string}

export type RunRow = {
    id: string
    bundle_key: string
    status: RunStatus
    scheduled_for?: string | null
    started_at?: string | null
    finished_at?: string | null
    /** Сводка: кандидатов, с досье, вердикты по видам, контрольные тайтлы, точность. */
    stats: Record<string, unknown>
    /** Готовый список для показа и будущей публикации (с трейлерами). */
    items: RunItem[]
    error?: string | null
    published_at?: string | null
    created_at: string
}

export type DossierRow = {media_type: MediaType, media_id: number, sources: Record<string, unknown>, fetched_at: string}

export interface BundleStore {
    readonly kind: 'supabase' | 'file' | 'memory' | 'empty'
    verdicts(bundleKey: string, rubricVersion?: number): Promise<VerdictRow[]>
    saveVerdicts(rows: VerdictRow[]): Promise<void>
    runs(bundleKey?: string): Promise<RunRow[]>
    saveRun(row: Omit<RunRow, 'id' | 'created_at'> & {id?: string, created_at?: string}): Promise<RunRow>
    dossiers(refs: Array<{media_type: MediaType, media_id: number}>): Promise<DossierRow[]>
    saveDossiers(rows: DossierRow[]): Promise<void>
}

const verdictKey = (row: Pick<VerdictRow, 'bundle_key' | 'media_type' | 'media_id' | 'rubric_version'>) =>
    `${row.bundle_key}|${row.media_type}|${row.media_id}|${row.rubric_version}`
const dossierKey = (row: {media_type: string, media_id: number}) => `${row.media_type}|${row.media_id}`
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

type MemoryData = {verdicts: VerdictRow[], runs: RunRow[], dossiers: DossierRow[]}

/** В памяти (тесты); FileBundleStore — то же с записью в JSON-файл. */
export class MemoryBundleStore implements BundleStore {
    readonly kind: 'memory' | 'file' | 'empty' = 'memory'
    protected data: MemoryData

    constructor(data?: Partial<MemoryData>) {
        this.data = {verdicts: [], runs: [], dossiers: [], ...data}
    }

    protected persist(): void {}

    async verdicts(bundleKey: string, rubricVersion?: number) {
        return this.data.verdicts.filter(row =>
            row.bundle_key === bundleKey && (rubricVersion === undefined || row.rubric_version === rubricVersion))
    }

    async saveVerdicts(rows: VerdictRow[]) {
        const index = new Map(this.data.verdicts.map((row, i) => [verdictKey(row), i]))
        for (const row of rows) {
            const at = index.get(verdictKey(row))
            if (at === undefined) {
                index.set(verdictKey(row), this.data.verdicts.length)
                this.data.verdicts.push(row)
            } else {
                this.data.verdicts[at] = row
            }
        }
        this.persist()
    }

    async runs(bundleKey?: string) {
        return this.data.runs
            .filter(row => !bundleKey || row.bundle_key === bundleKey)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
    }

    async saveRun(row: Omit<RunRow, 'id' | 'created_at'> & {id?: string, created_at?: string}) {
        const saved: RunRow = {...row, id: row.id ?? newId(), created_at: row.created_at ?? new Date().toISOString()}
        const at = this.data.runs.findIndex(existing => existing.id === saved.id)
        if (at >= 0) this.data.runs[at] = saved
        else this.data.runs.push(saved)
        this.persist()
        return saved
    }

    async dossiers(refs: Array<{media_type: MediaType, media_id: number}>) {
        const wanted = new Set(refs.map(dossierKey))
        return this.data.dossiers.filter(row => wanted.has(dossierKey(row)))
    }

    async saveDossiers(rows: DossierRow[]) {
        const index = new Map(this.data.dossiers.map((row, i) => [dossierKey(row), i]))
        for (const row of rows) {
            const at = index.get(dossierKey(row))
            if (at === undefined) this.data.dossiers.push(row)
            else this.data.dossiers[at] = row
        }
        this.persist()
    }

    /** Для тестов и отчётов: всё содержимое. */
    dump(): MemoryData {
        return this.data
    }
}

export class FileBundleStore extends MemoryBundleStore {
    override readonly kind = 'file' as const

    constructor(readonly file: string) {
        super(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) as MemoryData : undefined)
    }

    protected override persist() {
        fs.mkdirSync(path.dirname(this.file), {recursive: true})
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 1))
    }
}

/** Пусто и только чтение: таблиц нет, файла нет. */
class EmptyBundleStore extends MemoryBundleStore {
    override readonly kind = 'empty' as const
    override async saveVerdicts() {}
    override async saveRun(row: Omit<RunRow, 'id' | 'created_at'> & {id?: string, created_at?: string}) {
        return {...row, id: row.id ?? newId(), created_at: new Date().toISOString()}
    }
    override async saveDossiers() {}
}

/** Таблицы ещё не созданы (PostgREST: relation does not exist / schema cache). */
const isMissingTable = (error: {code?: string, message?: string} | null) =>
    Boolean(error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')))

export class MissingTablesError extends Error {}

export class SupabaseBundleStore implements BundleStore {
    readonly kind = 'supabase' as const
    private client: SupabaseClient

    /** client — для тестов (воображаемый Supabase в памяти); по умолчанию из SUPABASE_URL / SERVICE_ROLE. */
    constructor(client?: SupabaseClient) {
        this.client = client ?? createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
            auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false}
        })
    }

    private check(error: {code?: string, message?: string} | null, what: string) {
        if (!error) return
        if (isMissingTable(error)) throw new MissingTablesError(`[BUNDLES] ${what}: ${error.message}`)
        throw new Error(`[BUNDLES] ${what}: ${error.message}`)
    }

    async verdicts(bundleKey: string, rubricVersion?: number) {
        const rows: VerdictRow[] = []
        for (let from = 0; ; from += 1000) {
            let query = this.client.from('collection_bundle_verdicts').select('*').eq('bundle_key', bundleKey)
            if (rubricVersion !== undefined) query = query.eq('rubric_version', rubricVersion)
            const {data, error} = await query.range(from, from + 999)
            this.check(error, 'verdicts')
            rows.push(...(data ?? []) as VerdictRow[])
            if (!data || data.length < 1000) break
        }
        return rows
    }

    async saveVerdicts(rows: VerdictRow[]) {
        for (let i = 0; i < rows.length; i += 200) {
            const {error} = await this.client.from('collection_bundle_verdicts')
                .upsert(rows.slice(i, i + 200), {onConflict: 'bundle_key,media_type,media_id,rubric_version'})
            this.check(error, 'save verdicts')
        }
    }

    async runs(bundleKey?: string) {
        let query = this.client.from('collection_bundle_runs').select('*').order('created_at', {ascending: false}).limit(200)
        if (bundleKey) query = query.eq('bundle_key', bundleKey)
        const {data, error} = await query
        this.check(error, 'runs')
        return (data ?? []) as RunRow[]
    }

    async saveRun(row: Omit<RunRow, 'id' | 'created_at'> & {id?: string, created_at?: string}) {
        const {data, error} = await this.client.from('collection_bundle_runs').upsert(row).select('*').single()
        this.check(error, 'save run')
        return data as RunRow
    }

    async dossiers(refs: Array<{media_type: MediaType, media_id: number}>) {
        const rows: DossierRow[] = []
        for (const mediaType of ['movie', 'tv'] as const) {
            const ids = refs.filter(ref => ref.media_type === mediaType).map(ref => ref.media_id)
            for (let i = 0; i < ids.length; i += 200) {
                const {data, error} = await this.client.from('collection_bundle_dossiers').select('*')
                    .eq('media_type', mediaType).in('media_id', ids.slice(i, i + 200))
                this.check(error, 'dossiers')
                rows.push(...(data ?? []) as DossierRow[])
            }
        }
        return rows
    }

    async saveDossiers(rows: DossierRow[]) {
        for (let i = 0; i < rows.length; i += 100) {
            const {error} = await this.client.from('collection_bundle_dossiers')
                .upsert(rows.slice(i, i + 100), {onConflict: 'media_type,media_id'})
            this.check(error, 'save dossiers')
        }
    }
}

export const LOCAL_STORE_FILE = '.bundles-store.json'

/**
 * Хранилище для бота и скрипта расчёта:
 *   COLLECTION_BUNDLE_STORE=file:<путь> — JSON-файл (локальные прогоны);
 *   иначе Supabase; если таблиц ещё нет — вне production файл .bundles-store.json (если есть), иначе пусто.
 */
let cached: BundleStore | undefined
export const getBundleStore = async (): Promise<BundleStore> => {
    if (cached) return cached
    const configured = process.env.COLLECTION_BUNDLE_STORE?.trim()
    if (configured?.startsWith('file:')) return (cached = new FileBundleStore(path.resolve(configured.slice(5))))

    const supabase = new SupabaseBundleStore()
    try {
        await supabase.runs('__probe__')
        return (cached = supabase)
    } catch (error) {
        const local = path.resolve(LOCAL_STORE_FILE)
        const production = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
        console.warn('[BUNDLES] Store tables unavailable', error instanceof Error ? error.message : error)
        if (!production && fs.existsSync(local)) return (cached = new FileBundleStore(local))
        return (cached = new EmptyBundleStore())
    }
}

/** Для тестов: подставить хранилище. */
export const setBundleStore = (store: BundleStore | undefined) => {
    cached = store
}

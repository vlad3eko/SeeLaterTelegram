/**
 * Воображаемый Supabase для тестов: таблицы в памяти и те вызовы PostgREST-клиента, которыми
 * пользуется SupabaseBundleStore (select / eq / in / order / limit / range / upsert / single).
 * Таблица не создана (missing) — ошибка как у PostgREST (PGRST205), чтобы проверить запасной путь.
 */

type Row = Record<string, any>

export type FakeTables = Record<string, Row[]>

/** Первичные ключи таблиц миграции collection_bundles.sql — для upsert. */
const PRIMARY_KEYS: Record<string, string[]> = {
    collection_bundle_verdicts: ['bundle_key', 'media_type', 'media_id', 'rubric_version'],
    collection_bundle_runs: ['id'],
    collection_bundle_dossiers: ['media_type', 'media_id']
}

const DEFAULTS: Record<string, () => Row> = {
    collection_bundle_runs: () => ({id: globalThis.crypto.randomUUID(), created_at: new Date().toISOString(), status: 'queued', stats: {}, items: []})
}

class Query implements PromiseLike<{data: any, error: any}> {
    private filters: Array<(row: Row) => boolean> = []
    private sort?: {column: string, ascending: boolean}
    private max?: number
    private window?: [number, number]
    private upserted?: Row[]
    private one = false

    constructor(private tables: FakeTables, private table: string) {}

    select(_columns?: string) {
        return this
    }

    eq(column: string, value: unknown) {
        this.filters.push(row => row[column] === value)
        return this
    }

    in(column: string, values: unknown[]) {
        this.filters.push(row => values.includes(row[column]))
        return this
    }

    order(column: string, {ascending = true}: {ascending?: boolean} = {}) {
        this.sort = {column, ascending}
        return this
    }

    limit(count: number) {
        this.max = count
        return this
    }

    range(from: number, to: number) {
        this.window = [from, to]
        return this
    }

    single() {
        this.one = true
        return this
    }

    upsert(rows: Row | Row[], {onConflict}: {onConflict?: string} = {}) {
        const keys = onConflict?.split(',') ?? PRIMARY_KEYS[this.table] ?? ['id']
        const list = this.tables[this.table]
        if (!list) return this
        this.upserted = []
        for (const input of Array.isArray(rows) ? rows : [rows]) {
            const row = {...(DEFAULTS[this.table]?.() ?? {}), ...JSON.parse(JSON.stringify(input))}
            const at = list.findIndex(existing => keys.every(key => existing[key] === row[key]))
            if (at >= 0) list[at] = {...list[at], ...row}
            else list.push(row)
            this.upserted.push(at >= 0 ? list[at]! : row)
        }
        return this
    }

    private execute(): {data: any, error: any} {
        const list = this.tables[this.table]
        if (!list) {
            return {data: null, error: {code: 'PGRST205', message: `Could not find the table 'public.${this.table}' in the schema cache`}}
        }
        let rows = this.upserted ?? list.filter(row => this.filters.every(filter => filter(row)))
        if (this.sort) {
            const {column, ascending} = this.sort
            rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
        }
        if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1)
        if (this.max !== undefined) rows = rows.slice(0, this.max)
        const copy = JSON.parse(JSON.stringify(rows))
        return {data: this.one ? copy[0] ?? null : copy, error: null}
    }

    then<A = {data: any, error: any}, B = never>(
        resolve?: ((value: {data: any, error: any}) => A | PromiseLike<A>) | null,
        reject?: ((reason: unknown) => B | PromiseLike<B>) | null
    ): PromiseLike<A | B> {
        return Promise.resolve(this.execute()).then(resolve, reject)
    }
}

/** Клиент с таблицами; передать в new SupabaseBundleStore(fake as never). */
export const fakeSupabase = (tables: FakeTables) => ({
    tables,
    from: (table: string) => new Query(tables, table)
})

/** Все три таблицы миграции — пустые. */
export const bundleTables = (): FakeTables => ({
    collection_bundle_verdicts: [],
    collection_bundle_runs: [],
    collection_bundle_dossiers: []
})

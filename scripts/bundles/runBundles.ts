/**
 * Расчёт связок подборок /g: 2 связки за запуск (те, что дольше всех не считались), судья Gemini,
 * вердикты и готовый список — в хранилище (Supabase: collection_bundle_*). ТЗ — TASKS.md.
 *
 *   npm run bundles:run                                  — плановый запуск (2 связки)
 *   npm run bundles:run -- --bundle twist --limit 20     — конкретная связка, 20 новых тайтлов
 *   npm run bundles:run -- --store file:.bundles-store.json --no-wiki
 *
 * Флаги: --count N, --bundle a,b, --limit N (новых тайтлов на связку, по умолчанию 60),
 * --rejudge (судить заново по той же рубрике), --no-wiki (досье без Википедии),
 * --store file:<путь> (JSON-файл вместо Supabase).
 * Расписание — .github/workflows/collection-bundles.yml (пн и чт).
 */
import {BUNDLES} from '#server/global/engine/collections/bundles'
import {buildDossier} from '#server/global/engine/collections/judge/dossier'
import {geminiJudge} from '#server/global/engine/collections/judge/gemini'
import {bundleRunSummary, notifyBundleRun} from '#server/global/engine/collections/judge/notify'
import {runScheduled} from '#server/global/engine/collections/judge/run'
import {getBundleStore, setBundleStore} from '#server/global/engine/collections/judge/store'

const args = process.argv.slice(2)
const option = (name: string) => {
    const at = args.indexOf(`--${name}`)
    return at >= 0 ? args[at + 1] : undefined
}
const flag = (name: string) => args.includes(`--${name}`)

// Ссылка на запуск в GitHub Actions (в уведомлении администратору).
const runLink = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined

const main = async () => {
    const storeOption = option('store')
    if (storeOption) process.env.COLLECTION_BUNDLE_STORE = storeOption
    const store = await getBundleStore()
    if (store.kind === 'empty') {
        throw new Error('Таблиц collection_bundle_* нет (миграция database/migrations/collection_bundles.sql не применена). Для локального прогона: --store file:.bundles-store.json')
    }
    setBundleStore(store)

    const only = option('bundle')?.split(',').map(key => key.trim()).filter(Boolean)
    const unknown = only?.filter(key => !BUNDLES.some(bundle => bundle.key === key)) ?? []
    if (unknown.length) throw new Error(`Нет таких связок: ${unknown.join(', ')}`)
    const wiki = !flag('no-wiki')

    console.log(`[BUNDLES] Хранилище: ${store.kind}`)
    const runs = await runScheduled({
        store,
        ask: geminiJudge(),
        dossier: (mediaType, id) => buildDossier(mediaType, id, {wiki})
    }, {
        count: Number(option('count') ?? (only?.length || 2)),
        ...(only?.length ? {only} : {}),
        limit: Number(option('limit') ?? 60),
        rejudge: flag('rejudge')
    })

    const failed = runs.filter(run => run.status === 'failed')
    console.log(`[BUNDLES] Готово: ${runs.map(run => `${run.bundle_key} ${run.status}${run.stats?.publishable === false ? ' (контроль провален)' : ''}`).join(', ')}`)
    await notifyBundleRun(bundleRunSummary(runs, {link: runLink}), process.env, runs)
    if (failed.length) process.exitCode = 1
}

main().catch(async error => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[BUNDLES] Ошибка', message)
    await notifyBundleRun(bundleRunSummary([], {error: message, link: runLink}))
    process.exitCode = 1
})

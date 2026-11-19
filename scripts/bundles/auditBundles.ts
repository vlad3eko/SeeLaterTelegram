/**
 * Аудит связок подборок /g (ТЗ, пункт 3): по каждой связке и полке — сколько кандидатов даёт
 * TMDB, первые 10 (как в подборке), вердикты судьи из хранилища и предупреждения:
 *   - меньше minResults кандидатов — связка на полке пустая;
 *   - у судимой нет «да» — бот её скрывает;
 *   - контрольные тайтлы последнего расчёта провалены.
 *
 *   npm run bundles:audit                               — все связки, отчёт в консоль
 *   npm run bundles:audit -- --bundle twist,survival --out .bundles-audit.md
 *
 * Запросы только к TMDB (кэш в памяти); судья не вызывается.
 */
import fs from 'node:fs'
import {bundleSections, BUNDLES, rubricOf} from '#server/global/engine/collections/bundles'
import {bundleScore, meanRating} from '#server/global/engine/collections/bundleRules'
import {collectCandidates} from '#server/global/engine/collections/buildCollection'
import {SHELVES} from '#server/global/engine/collections/shelves'
import {getBundleStore, setBundleStore} from '#server/global/engine/collections/judge/store'

const args = process.argv.slice(2)
const option = (name: string) => {
    const at = args.indexOf(`--${name}`)
    return at >= 0 ? args[at + 1] : undefined
}

const main = async () => {
    const storeOption = option('store')
    if (storeOption) process.env.COLLECTION_BUNDLE_STORE = storeOption
    const store = await getBundleStore()
    setBundleStore(store)
    const only = option('bundle')?.split(',').map(key => key.trim()).filter(Boolean)
    const bundles = only?.length ? BUNDLES.filter(bundle => only.includes(bundle.key)) : BUNDLES

    const lines: string[] = [`# Аудит связок /g — ${new Date().toISOString().slice(0, 10)}`, '', `Хранилище вердиктов: ${store.kind}.`, '']
    const warnings: string[] = []

    for (const bundle of bundles) {
        const rubric = rubricOf(bundle)
        const verdicts = await store.verdicts(bundle.key, rubric.version)
        const runs = await store.runs(bundle.key)
        const lastRun = runs.find(run => run.status === 'done')
        const counts = {yes: 0, borderline: 0, no: 0, insufficient: 0}
        for (const row of verdicts) counts[row.verdict]++
        const byId = new Map(verdicts.map(row => [`${row.media_type}:${row.media_id}`, row]))

        lines.push(`## ${bundle.emoji} ${bundle.title} (\`${bundle.key}\`, ${bundle.kind}, ${bundle.ranking})`, '', `> ${bundle.lead}`, '')
        lines.push(`Вердикты (рубрика v${rubric.version}): да ${counts.yes}, пограничных ${counts.borderline}, нет ${counts.no}, нет данных ${counts.insufficient}.` +
            (lastRun ? ` Последний расчёт ${String(lastRun.finished_at ?? lastRun.created_at).slice(0, 10)}: контроль ${lastRun.stats?.publishable === false ? '**провален**' : 'пройден'}.` : ' Расчётов не было.'), '')
        if (lastRun?.stats?.publishable === false) warnings.push(`${bundle.key}: контрольные тайтлы провалены`)
        if (bundle.kind === 'judged' && counts.yes < bundle.minResults) warnings.push(`${bundle.key}: «да» ${counts.yes} < ${bundle.minResults} — бот связку скрывает`)

        for (const shelfKey of bundle.shelves) {
            const shelf = SHELVES[shelfKey]
            const section = shelf.mediaType === 'movie' ? 'movies' : 'series_completed'
            if (!bundleSections(bundle).includes(section)) {
                lines.push(`- **${shelf.label}** — раздел ${section} не входит в связку (разделы: ${bundleSections(bundle).join(', ')})`)
                continue
            }
            try {
                const {candidates, capped} = await collectCandidates(
                    {section, criterion: 'bundle', bundle: bundle.key, shelf: shelfKey, period: 'all'}, [], {ignoreVerdicts: true})
                const mean = meanRating(candidates.map(candidate => candidate.item))
                const maxLogPopularity = Math.max(1e-9, ...candidates.map(candidate => Math.log1p(Number(candidate.item.popularity) || 0)))
                const top = candidates
                    .map(candidate => ({candidate, score: bundleScore(bundle, shelf, candidate.item, candidate.keywords ?? null, {mean, maxLogPopularity})}))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 10)
                lines.push(`- **${shelf.label}** — кандидатов ${candidates.length}${capped ? '+' : ''}`)
                for (const {candidate, score} of top) {
                    const item = candidate.item
                    const verdict = byId.get(`${shelf.mediaType}:${item.id}`)
                    const date = String(item.release_date || item.first_air_date || '').slice(0, 4)
                    lines.push(`  - ${item.title || item.name} (${date}) — ${score.toFixed(3)}, ★${Number(item.vote_average).toFixed(1)} / ${item.vote_count}` +
                        (verdict ? ` — судья: **${verdict.verdict}** ${verdict.score}: ${verdict.reason}` : ''))
                }
                if (candidates.length < bundle.minResults) warnings.push(`${bundle.key} · ${shelf.label}: кандидатов ${candidates.length} < ${bundle.minResults}`)
            } catch (error) {
                lines.push(`- **${shelf.label}** — ошибка: ${error instanceof Error ? error.message : error}`)
            }
        }
        lines.push('')
    }

    lines.splice(4, 0, '## Предупреждения', '', ...(warnings.length ? warnings.map(warning => `- ${warning}`) : ['- нет']), '')
    const report = lines.join('\n')
    const out = option('out')
    if (out) {
        fs.writeFileSync(out, report)
        console.log(`[BUNDLES AUDIT] Отчёт: ${out} (предупреждений ${warnings.length})`)
    } else {
        console.log(report)
    }
}

main().catch(error => {
    console.error('[BUNDLES AUDIT] Ошибка', error instanceof Error ? error.message : error)
    process.exitCode = 1
})

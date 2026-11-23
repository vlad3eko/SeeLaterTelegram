import {isAdmin} from '#server/bot/consts/admins'
import {BUNDLE_LIST} from '#server/bot/callbacks/routes'
import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {LIST_MARKER, bundleListKeyboard, bundleListText} from '#server/global/engine/collections/judge/notify'
import type {RunRow} from '#server/global/engine/collections/judge/store'

/**
 * «📋 Показать список» / «▲ Скрыть список» под итогом судьи связок: дописывает к тексту
 * сообщения готовые списки расчётов (или убирает их). Текст итога берётся из самого сообщения —
 * ссылка на запуск GitHub Actions в нём сохраняется.
 */
export const bundleListAction = async (ctx: any) => {
    if (!isAdmin(ctx.from?.id)) return ctx.answerCbQuery().catch(() => undefined)
    const {runs: prefixes, open} = BUNDLE_LIST.parse(ctx)
    const summary = String(ctx.callbackQuery?.message?.text ?? '').split(LIST_MARKER)[0]!.trimEnd()

    let text = summary
    if (open) {
        // Расчёты по началу id: свежие 200 строк с запасом покрывают один запуск.
        const {data, error} = await (getSupabase() as any).from('collection_bundle_runs')
            .select('id,bundle_key,status,items').order('created_at', {ascending: false}).limit(200)
        if (error) return ctx.answerCbQuery('Не удалось прочитать расчёты').catch(() => undefined)
        const runs = prefixes
            .map(prefix => (data as RunRow[] ?? []).find(row => String(row.id).startsWith(prefix)))
            .filter((row): row is RunRow => Boolean(row))
        if (!runs.length) return ctx.answerCbQuery('Расчёты не найдены').catch(() => undefined)
        text = `${summary}\n\n${bundleListText(runs)}`
    }

    await ctx.editMessageText(text.slice(0, 4096), {
        link_preview_options: {is_disabled: true},
        reply_markup: bundleListKeyboard(prefixes, !open)
    }).catch((error: any) => {
        if (!String(error?.response?.description ?? '').includes('not modified')) console.warn('[BUNDLES LIST]', error?.response?.description ?? error)
    })
    await ctx.answerCbQuery().catch(() => undefined)
}

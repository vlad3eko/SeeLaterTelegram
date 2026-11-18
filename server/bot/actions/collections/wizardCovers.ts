import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import type {WizardScreen} from '#server/bot/actions/collections/wizardState'

/**
 * Обложки экранов мастера /g (таблица collection_covers). Их раз в квартал рисует и загружает
 * в служебный Telegram-канал scripts/covers/buildCovers.mjs (GitHub Actions), здесь — только file_id.
 * На экран несколько вариантов: вариант выбирается по id сообщения мастера, поэтому в одном меню
 * картинка не прыгает от нажатия к нажатию, а при новом /g может быть другой.
 */

/** Экраны, у которых есть обложка; loading — пока собирается подборка, result — все страницы готовой подборки. */
export type CoverScreen = Exclude<WizardScreen, 'title'> | 'loading'

const CACHE_TTL_MS = 60 * 60_000
let cache: {at: number, covers: Map<string, string[]>} | null = null
let loading: Promise<Map<string, string[]>> | null = null

const loadCovers = async (): Promise<Map<string, string[]>> => {
    const {data, error} = await getSupabase()
        .from('collection_covers')
        .select('screen,variant,file_id')
        .order('variant', {ascending: true})
    if (error) throw new Error(error.message)

    const covers = new Map<string, string[]>()
    for (const row of data ?? []) {
        if (!row.file_id) continue
        covers.set(row.screen, [...(covers.get(row.screen) ?? []), row.file_id])
    }
    return covers
}

const coversMap = async () => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.covers
    loading ??= loadCovers()
        .then(covers => {
            cache = {at: Date.now(), covers}
            return covers
        })
        .catch(error => {
            // Нет таблицы или сбой базы — мастер работает без картинок; повторим через минуту.
            console.warn('[COLLECTIONS] Covers unavailable', error instanceof Error ? error.message : error)
            cache = {at: Date.now() - CACHE_TTL_MS + 60_000, covers: new Map()}
            return cache.covers
        })
        .finally(() => {
            loading = null
        })
    return loading
}

/** file_id обложки экрана или undefined (обложек нет — показываем мастер без картинки). */
export const coverFor = async (screen: CoverScreen, seed?: number): Promise<string | undefined> => {
    const variants = (await coversMap()).get(screen)
    if (!variants?.length) return undefined
    const index = seed === undefined ? Math.floor(Math.random() * variants.length) : Math.abs(seed) % variants.length
    return variants[index]
}

/** Забыть обложку, которую Telegram не принял (удалена из канала и т. п.), — перечитать таблицу. */
export const forgetCovers = () => {
    cache = null
}

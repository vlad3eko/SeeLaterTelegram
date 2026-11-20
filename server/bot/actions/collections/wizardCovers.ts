import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import type {WizardScreen} from '#server/bot/actions/collections/wizardState'

/**
 * Обложки экранов мастера /g (таблица collection_covers) — по одной анимации (GIF в Telegram) на экран. Их раз в квартал рисует
 * и загружает в служебный Telegram-канал от имени обоих ботов scripts/covers/buildCovers.mjs (GitHub Actions),
 * здесь — только file_id.
 */

/**
 * Экраны, у которых есть обложка; loading — пока собирается подборка, result — все страницы готовой подборки,
 * cartoons и cseries — все экраны разделов «Мультфильмы» и «Мультсериалы».
 */
export type CoverScreen = Exclude<WizardScreen, 'title'> | 'loading' | 'cartoons' | 'cseries'

const CACHE_TTL_MS = 60 * 60_000
let cache: {at: number, covers: Map<string, string>} | null = null
let loading: Promise<Map<string, string>> | null = null

/**
 * file_id принадлежит боту, который загрузил файл, поэтому у каждого бота свои строки (колонка bot):
 * в разработке — тестовый бот (TELEGRAM_DEV_TOKEN), иначе боевой. Тот же выбор, что в server/bot/bot.ts.
 */
export const coversBot = (env: NodeJS.ProcessEnv = process.env) => env.NODE_ENV === 'development' ? 'dev' : 'prod'

const loadCovers = async (): Promise<Map<string, string>> => {
    const {data, error} = await getSupabase().from('collection_covers').select('screen,file_id')
        .eq('bot', coversBot()).order('variant', {ascending: true})
    if (error) throw new Error(error.message)

    // Строки отсортированы по variant: до перехода на GIF у экрана было по три картинки — берём первую.
    const covers = new Map<string, string>()
    for (const row of data ?? []) {
        if (row.file_id && !covers.has(row.screen)) covers.set(row.screen, row.file_id)
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
export const coverFor = async (screen: CoverScreen): Promise<string | undefined> => (await coversMap()).get(screen)

/**
 * Обложка — GIF или (до первой публикации GIF у боевого бота) прежняя картинка. Тип записан в самом
 * file_id Bot API: у анимаций он начинается с «CgAC», у фото — с «AgAC»; отдельной колонки не нужно.
 */
export const isAnimationCover = (fileId: string) => fileId.startsWith('CgAC')

/** Блок rich-сообщения с обложкой: анимация проигрывается сама по кругу, как GIF. */
export const coverBlock = (fileId: string) => isAnimationCover(fileId)
    ? {type: 'animation', animation: {type: 'animation', media: fileId}}
    : {type: 'photo', photo: {type: 'photo', media: fileId}}

/** Забыть обложку, которую Telegram не принял (удалена из канала и т. п.), — перечитать таблицу. */
export const forgetCovers = () => {
    cache = null
}

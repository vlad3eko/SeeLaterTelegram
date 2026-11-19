/**
 * Ход работы воркера одним сообщением в чате администратора (запрос владельца 20.11):
 * ⏳ — идёт, ✅ — готово (со временем), ▫️ — впереди, ❌ — ошибка с причиной.
 *
 * Воркер ведёт этапы сам: шаги `runReelStep` (имена вроде DOWNLOAD_TRAILER) сводятся к этапам
 * (STEP_STAGE), текст рисует renderReelProgress, а бот только подставляет его в сообщение
 * проверки (`/api/bot/reelJobs/progress`). Модуль без зависимостей: его берут и воркер, и бот.
 */

export type ReelStageKey =
    | 'launch' | 'source' | 'index' | 'transcribe' | 'fragments' | 'fragmentPreviews'
    | 'clean' | 'preview' | 'hooks' | 'subtitles' | 'decorate' | 'upload' | 'publish'

const STAGES: Record<ReelStageKey, {doing: string, done: string}> = {
    launch: {doing: 'Запускаю воркер', done: 'Воркер запущен'},
    source: {doing: 'Получаю исходник', done: 'Исходник получен'},
    index: {doing: 'Разбираю видео на планы и паузы', done: 'Видео разобрано на планы и паузы'},
    transcribe: {doing: 'Расшифровываю речь', done: 'Речь расшифрована'},
    fragments: {doing: 'Gemini выбирает лучшие фрагменты', done: 'Gemini выбрал фрагменты'},
    fragmentPreviews: {doing: 'Готовлю превью фрагментов', done: 'Превью фрагментов готовы'},
    clean: {doing: 'Монтирую clean: кадр и слежение за лицом', done: 'Clean смонтирован'},
    preview: {doing: 'Готовлю превью для Telegram', done: 'Превью для Telegram готово'},
    hooks: {doing: 'Gemini смотрит фрагмент и пишет хук', done: 'Хук написан'},
    subtitles: {doing: 'Субтитры: распознаю речь и перевожу', done: 'Субтитры готовы'},
    decorate: {doing: 'Финальная сборка: хук, субтитры, «Сохрани»', done: 'Ролик собран'},
    upload: {doing: 'Загружаю ролик', done: 'Ролик загружен'},
    publish: {doing: 'Публикую в Telegram и Instagram', done: 'Передал на публикацию'}
}

/** Шаги воркера → этап. Шагов нет в списке (кэш clean, запись хука) — этап не меняется. */
export const STEP_STAGE: Record<string, ReelStageKey> = {
    CHECK_SOURCE_IN_R2: 'source',
    DOWNLOAD_SOURCE_FROM_R2: 'source',
    DOWNLOAD_TRAILER: 'source',
    UPLOAD_SOURCE_TO_R2: 'source',
    BUILD_SOURCE_INDEX: 'index',
    TRANSCRIBE_SOURCE: 'transcribe',
    GEMINI_SELECT_FRAGMENTS: 'fragments',
    GEMINI_REVIEW_FRAGMENT_STORY: 'fragments',
    RENDER_FRAGMENT_PREVIEWS: 'fragmentPreviews',
    PREPARE_INSTAGRAM_VIDEO: 'clean',
    UPLOAD_CLEAN_VIDEO_TO_R2: 'clean',
    CREATE_CLEAN_PREVIEW: 'preview',
    UPLOAD_CLEAN_PREVIEW_TO_R2: 'preview',
    GENERATE_INSTAGRAM_HOOK_OPTIONS: 'hooks',
    GENERATE_INSTAGRAM_HOOK_FROM_VIDEO: 'hooks',
    GENERATE_INSTAGRAM_SUBTITLES: 'subtitles',
    GENERATE_SAVE_CTA: 'decorate',
    DECORATE_INSTAGRAM_VIDEO: 'decorate',
    UPLOAD_FINAL_REEL_TO_R2: 'upload'
}

/** Подробность к этапу по шагу: откуда взят исходник. */
const STEP_DETAIL: Record<string, string> = {
    DOWNLOAD_SOURCE_FROM_R2: 'из хранилища',
    DOWNLOAD_TRAILER: 'с YouTube'
}

export type ReelFlow = 'fragments' | 'clean' | 'hooks' | 'finish' | 'full'

const FLOW: Record<ReelFlow, {title: string, stages: ReelStageKey[]}> = {
    fragments: {title: 'поиск фрагментов', stages: ['launch', 'source', 'index', 'transcribe', 'fragments', 'fragmentPreviews']},
    clean: {title: 'сборка clean', stages: ['launch', 'source', 'clean', 'preview']},
    hooks: {title: 'варианты хука', stages: ['launch', 'hooks']},
    finish: {title: 'финальная сборка', stages: ['launch', 'hooks', 'subtitles', 'decorate', 'upload', 'publish']},
    full: {title: 'Reel', stages: ['launch', 'source', 'clean', 'hooks', 'subtitles', 'decorate', 'upload', 'publish']}
}

/** Какой план показывать: фаза воркера и то, что уже выбрано. */
export const reelFlowOf = ({phase, clip, fragmentChosen, hookChosen}: {
    phase: string
    clip: boolean
    fragmentChosen: boolean
    hookChosen?: boolean
}): {flow: ReelFlow, skip: ReelStageKey[]} => {
    if (phase === 'clean') return {flow: clip && !fragmentChosen ? 'fragments' : 'clean', skip: []}
    if (phase === 'hooks') return {flow: 'hooks', skip: []}
    if (phase === 'finish') return {flow: 'finish', skip: hookChosen ? ['hooks'] : []}
    return {flow: 'full', skip: []}
}

type Status = 'pending' | 'active' | 'done' | 'failed' | 'skipped'
type Stage = {key: ReelStageKey, status: Status, startedAt?: number, ms?: number, detail?: string, error?: string, running: number}

export const formatDuration = (ms: number) => {
    const seconds = Math.max(0, Math.round(ms / 1000))
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Причина для человека: первая строка ошибки, известные случаи — понятным текстом. */
export const humanReelError = (error: unknown): string => {
    const text = error instanceof Error ? error.message : String(error ?? '')
    if (/confirm you.{1,3}re not a bot|cookies are no longer valid/i.test(text)) {
        return 'YouTube требует вход: обнови cookies (YOUTUBE_COOKIES_B64)'
    }
    if (/WORKER DEADLINE/.test(text)) return 'воркер не уложился во время и остановлен'
    return text.split('\n')[0]!.replace(/^\[[A-Z _]+\]\s*/, '').replace(/^\w*Error:\s*/, '').slice(0, 200)
}

const line = (stage: Stage): string => {
    const labels = STAGES[stage.key]
    const extra = [stage.detail, stage.ms !== undefined ? formatDuration(stage.ms) : ''].filter(Boolean).join(' · ')
    switch (stage.status) {
        case 'done': return `✅ ${labels.done}${extra ? ` · ${extra}` : ''}`
        case 'active': return `⏳ ${labels.doing}…`
        case 'failed': return `❌ ${labels.doing}: ${stage.error ?? 'ошибка'}`
        default: return `▫️ ${labels.doing}`
    }
}

export const renderReelProgress = (title: string, flow: ReelFlow, stages: Stage[]): string =>
    [`🎬 ${title} — ${FLOW[flow].title}`, ...stages.filter(stage => stage.status !== 'skipped').map(line)].join('\n')

/** Текст первого сообщения (бот, до запуска воркера): весь план, первым — запуск. */
export const initialReelProgress = (title: string, flow: ReelFlow, skip: ReelStageKey[] = []): string =>
    renderReelProgress(title, flow, FLOW[flow].stages
        .filter(key => !skip.includes(key))
        .map((key, index) => ({key, status: index === 0 ? 'active' : 'pending', running: 0})))

/**
 * Состояние этапов одного запуска воркера. `send` получает новый текст после каждого
 * изменения (по одному, по порядку; ошибка отправки не останавливает сборку).
 */
export const createReelProgress = ({title, flow, skip = [], send, now = Date.now}: {
    title: string
    flow: ReelFlow
    skip?: ReelStageKey[]
    send: (text: string) => Promise<void>
    now?: () => number
}) => {
    const stages: Stage[] = FLOW[flow].stages
        .filter(key => !skip.includes(key))
        .map(key => ({key, status: 'pending', running: 0}))
    let lastText = ''
    let queue = Promise.resolve()

    const push = () => {
        const text = renderReelProgress(title, flow, stages)
        if (text === lastText) return
        lastText = text
        queue = queue.then(() => send(text)).catch(error => {
            console.warn('[REEL PROGRESS SEND FAILED]', error instanceof Error ? error.message : error)
        })
    }

    // Воркер работает — значит, запущен (время запуска Cloud Run воркеру не видно).
    const launch = stages.find(stage => stage.key === 'launch')
    if (launch) launch.status = 'done'
    push()

    const stageOf = (key: ReelStageKey): Stage => {
        let stage = stages.find(item => item.key === key)
        if (!stage) {
            // Этап вне плана (сбой выбора фрагментов → clean по умолчанию): дописать в конец.
            stage = {key, status: 'pending', running: 0}
            stages.push(stage)
        }
        return stage
    }

    const start = (key: ReelStageKey, detail?: string) => {
        const stage = stageOf(key)
        if (stage.running === 0 && stage.status !== 'active') {
            stage.status = 'active'
            stage.startedAt = now()
            stage.error = undefined
        }
        stage.running++
        if (detail) stage.detail = detail
        push()
    }

    const done = (key: ReelStageKey) => {
        const stage = stageOf(key)
        stage.running = Math.max(0, stage.running - 1)
        if (stage.running === 0 && stage.status === 'active') {
            stage.status = 'done'
            stage.ms = now() - (stage.startedAt ?? now())
        }
        push()
    }

    const fail = (key: ReelStageKey, error: unknown) => {
        const stage = stageOf(key)
        stage.running = 0
        stage.status = 'failed'
        stage.error = humanReelError(error)
        push()
    }

    return {
        /** Слушатель шагов `runReelStep`. */
        onStep: (name: string, event: 'start' | 'done' | 'error', error?: unknown) => {
            const key = STEP_STAGE[name]
            if (!key) return
            if (event === 'start') start(key, STEP_DETAIL[name])
            else if (event === 'done') done(key)
            else fail(key, error)
        },
        start,
        done,
        /** Воркер упал: идущий этап (или следующий по плану) — ❌ с причиной. */
        failCurrent: (error: unknown) => {
            const stage = stages.find(item => item.status === 'active')
                ?? stages.find(item => item.status === 'pending')
                ?? stages.at(-1)!
            fail(stage.key, error)
        },
        /** Этапы, до которых дело не дошло (субтитры выключены), убрать из сообщения. */
        skipPending: () => {
            for (const stage of stages) if (stage.status === 'pending') stage.status = 'skipped'
            push()
        },
        /** Дождаться отправки всех изменений (перед передачей задачи финализатору). */
        flush: () => queue
    }
}

export type ReelProgress = ReturnType<typeof createReelProgress>

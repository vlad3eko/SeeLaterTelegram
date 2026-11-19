
import {GoogleGenAI} from "@google/genai"
import {
    isBudgetExceeded,
    runWithBudget,
    withBudgetReserve,
    withinBudget
} from "#server/global/engine/instagram/reel/subtitle/utils/budget"
import {hookFactLines, type HookFacts, unsupportedClaims} from "#server/global/engine/instagram/reel/utils/hookFacts"

type GenreInput =
    | string
    | Array<{
    id?: number
    name?: string
} | string>

type InstagramHookContext = {
    title?: string
    overview?: string
    genre?: GenreInput
    /** movie | tv */
    type?: string
    facts?: HookFacts
}

const sleep = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms))

const GEMINI_FILE_PROCESSING_TIMEOUT_MS = 90_000
const GEMINI_FILE_POLL_INTERVAL_MS = 2_000

const getGenreText = (genre?: GenreInput): string => {
    if (Array.isArray(genre)) {
        return genre
            .map(item => typeof item === 'string' ? item : item.name ?? '')
            .filter(Boolean)
            .join(', ')
    }

    return String(genre ?? '').trim()
}

const getErrorDetails = (error: unknown) => {
    if (error instanceof Error) {
        const sdkError = error as Error & {
            code?: unknown
            status?: unknown
            statusCode?: unknown
            details?: unknown
        }

        return {
            name: error.name,
            message: error.message,
            code: sdkError.code,
            status: sdkError.status ?? sdkError.statusCode,
            details: sdkError.details,
            stack: error.stack
        }
    }

    return {
        message: String(error)
    }
}

const HOOK_MIN_WORDS = 3
// «Аль Пачино и Энтони Хопкинс в схватке за империю» — 9 слов вместе с предлогами.
const HOOK_MAX_WORDS = 9

// decorateInstagramVideo делит хук на две строки по ~25 знаков.
// Хук длиннее не считается ошибкой (шрифт ужмётся), но такие варианты
// выбираем в последнюю очередь.
const HOOK_PREFERRED_MAX_CHARS = 50

const HOOK_UNDETERMINED = 'НЕ УДАЛОСЬ ОПРЕДЕЛИТЬ'

const wordStart = (stems: string) =>
    new RegExp(`(?<![а-яё])(?:${stems})`, 'iu')

// Штампы, которые модель выдаёт рефлекторно (правило 8 промпта). Фильтр мягкий: из кандидатов предпочитаем хук
// без штампов, но если чистых нет, отдаём выбор модели. Жёсткий отказ
// привёл бы к шаблонному хуку-заглушке из createInstagramHook, а он хуже.
const HOOK_SLOP_PATTERNS: Array<{ label: string, pattern: RegExp }> = [
    {
        label: 'тайна',
        pattern: wordStart('тайн|таинств|загадоч|секретн|истинн|роков')
    },

    {
        label: 'пафос',
        pattern: wordStart('смертельн|жесток|эпичн|шокир|невероятн|навсегда')
    },
    {
        label: 'штамп',
        pattern: wordStart(
            'только начинается|не по плану|слишком далеко|оборачива|правила игры|меня\\S{1,3} вс[её]'
        )
    },
    {
        label: 'схема «X, но Y»',
        pattern: /,\s*но\s/iu
    }
]

type ParsedHookResponse = {
    chosen?: string
    candidates: string[]
    analysis: string[]
}

// Кавычки вокруг всего хука снимаются, но не кавычки названия внутри
// («Создатели «Игры престолов» возвращаются», «Морской котик» учит…).
const unwrapQuotes = (value: string) => {
    const inner = value.match(/^["'«“„](.*)["'»”]$/u)?.[1]
    return inner !== undefined && !/["«»“”„]/u.test(inner) ? inner : value
}

const cleanHook = (value: string) =>
    unwrapQuotes(
        value
            .replace(/\s+/g, ' ')
            .replace(/\s*\([^)]*\)\s*$/u, '')
            .trim()
    )
        .replace(/\.+$/u, '')
        .trim()

const countWords = (hook: string) =>
    hook
        .split(/\s+/)
        .filter(token => /[\p{L}\p{N}]/u.test(token))
        .length

const isValidHook = (hook: string) => {
    const wordCount = countWords(hook)

    return (
        wordCount >= HOOK_MIN_WORDS &&
        wordCount <= HOOK_MAX_WORDS &&
        hook.toUpperCase() !== HOOK_UNDETERMINED
    )
}

const findSlop = (hook: string): string[] =>
    HOOK_SLOP_PATTERNS
        .filter(({pattern}) => pattern.test(hook))
        .map(({label}) => label)

// Ответ модели: СЦЕНА / ВАРИАНТЫ (1–4) / ХУК. СЦЕНА заставляет модель сверить
// обещание заголовка с отрывком; наружу отдаются только варианты и хук.
const parseHookResponse = (rawOutput: string): ParsedHookResponse => {
    const lines = rawOutput
        .replace(/[*_`]/g, '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)

    const analysis: string[] = []
    const candidates: string[] = []
    let chosen: string | undefined

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index] ?? ''
        const label = line.match(/^(СЦЕНА|ХУК)\s*:\s*(.*)$/iu)

        if (label) {
            const name = (label[1] ?? '').toUpperCase()
            const value = label[2] || (name === 'ХУК' ? lines[index + 1] ?? '' : '')

            if (name === 'ХУК') {
                // Если строк «ХУК:» несколько, побеждает последняя.
                chosen = cleanHook(value)
            } else {
                analysis.push(`${name}: ${value}`)
            }

            continue
        }

        const numbered = line.match(/^\d+[.)]\s*(.+)$/u)

        if (numbered) {
            candidates.push(cleanHook(numbered[1] ?? ''))
        }
    }

    // Модель могла проигнорировать формат и вернуть один хук одной строкой.
    if (!chosen && !candidates.length && lines.length === 1) {
        chosen = cleanHook(lines[0] ?? '')
    }

    return {
        chosen: chosen || undefined,
        candidates: candidates.filter(Boolean),
        analysis
    }
}

// Все пригодные хуки ответа, лучший первым: без штампов, затем короткие.
// Выбор модели идёт первым: при равной оценке побеждает он (sort стабилен).
// Хук с наградой, сезоном или серией сверх проверенных фактов не пригоден.
const rankHooks = ({chosen, candidates}: ParsedHookResponse, facts?: HookFacts): string[] => {
    // Модель сама сказала, что сцену определить нельзя.
    if (chosen?.toUpperCase() === HOOK_UNDETERMINED) {
        return []
    }

    const pool = new Map<string, string>()

    for (const item of [chosen, ...candidates]) {
        if (item && isValidHook(item) && !pool.has(item.toLowerCase()) && isHonest(item, facts)) {
            pool.set(item.toLowerCase(), item)
        }
    }

    const penalty = (hook: string) =>
        findSlop(hook).length * 10 +
        (hook.length > HOOK_PREFERRED_MAX_CHARS ? 1 : 0)

    return [...pool.values()].sort((a, b) => penalty(a) - penalty(b))
}

const isHonest = (hook: string, facts?: HookFacts): boolean => {
    const problems = unsupportedClaims(hook, facts)
    if (problems.length) console.warn('[GEMINI HOOK UNSUPPORTED]', {hook, problems})
    return !problems.length
}

const selectHook = (parsed: ParsedHookResponse, facts?: HookFacts): string | undefined =>
    rankHooks(parsed, facts)[0]

/** Сколько вариантов показывается администратору при ручной проверке (кнопки 1–4). */
export const HOOK_OPTIONS_COUNT = 4

/** Вариант для выбора администратором может быть длиннее одиночного хука. */
const OPTION_MAX_WORDS = 10


type HookSource = 'video' | 'text'

// Что меняется в промпте, когда ролика нет: заголовок только по описанию и фактам.
const HOOK_PROMPT_PARTS: Record<HookSource, {clip: string, scene: string}> = {
    video: {
        clip: 'ВИДЕО — отрывок, поверх которого встанет заголовок. Пересказывать его не нужно, но заголовок должен ему соответствовать: по тону (комедию не продавай как триллер) и по обещанию (не обещай того, чего в фильме и отрывке нет). Реплики в видео помогают понять конфликт.',
        scene: 'СЦЕНА: тон отрывка и что он обещает зрителю, одна фраза'
    },
    text: {
        clip: 'Видео ты не видел: опирайся на описание и факты, не выдумывай событий, которых в описании нет.',
        scene: 'СЦЕНА: что обещает зрителю описание, одна фраза'
    }
}

/**
 * Заголовок в стиле редакционного анонса (решение владельца 20.11): продаёт сам фильм —
 * звёзды, награды, создатели, новый сезон, масштаб конфликта, — а видео проверяет, что обещание
 * подходит отрывку. Награды, сезон и серия берутся только из проверенных фактов (utils/hookFacts.ts);
 * варианты с утверждениями сверх фактов отбрасывает код (unsupportedClaims).
 */
export const buildHookPrompt = (
    context: InstagramHookContext,
    source: HookSource = 'video'
): string => {
    const p = HOOK_PROMPT_PARTS[source]
    const facts = hookFactLines(context.facts)
    const kind = context.type === 'tv' ? 'сериал' : context.type === 'movie' ? 'фильм' : 'фильм или сериал'

    return `
Ты — редактор анонсов русскоязычного кино-медиа. Пишешь заголовок для Instagram Reels: он стоит поверх видео в первые секунды, его читают без звука и решают, смотреть ли ролик.

Заголовок продаёт само произведение, а не пересказывает кадр: звёзды, награды, создатели, новый сезон, масштаб конфликта, необычная идея. Примеры стиля (это не факты о текущем фильме):
- Номинированный на «Эмми» сериал возвращается
- Аль Пачино и Энтони Хопкинс в схватке за империю
- Создатели «Игры престолов» берутся за космос
- Оскароносная драма о цене власти
- Шаламе и Зендея снова в пустыне

О ПРОИЗВЕДЕНИИ
Тип: ${kind}
Название: ${context.title || 'не указано'}
Жанры: ${getGenreText(context.genre) || 'не указаны'}
Описание: ${context.overview || 'не указано'}

ПРОВЕРЕННЫЕ ФАКТЫ
${facts.length ? facts.map(line => `- ${line}`).join('\n') : '- Нет. Пиши через сюжет, конфликт и масштаб.'}

${p.clip}

ПРАВИЛА
1. Одна главная мысль: один сильный факт, или сюжетное обещание, или факт вместе с обещанием («… в схватке за империю»).
2. Награды, номинации, новый сезон и продолжение серии — только из фактов. Номинацию не выдавай за победу. «Оскароносный», «лауреат» — только если в фактах есть «Получил» с этой премией.
3. Актёров и создателей бери из фактов, не больше двух имён. Называй их, только если имя знакомо широкому зрителю; малоизвестное имя ничего не продаёт — тогда пиши через сюжет. Известную прошлую работу создателя или актёра называй, только если уверен в ней.
4. Слово «хит» не используй: данных о просмотрах нет.
5. «Схватка», «битва», «противостояние» допустимы, если такой конфликт правда есть в фильме.
6. Название этого фильма не пиши: оно будет в подписи.
7. Не раскрывай повороты и концовку.
8. Без штампов: «это изменит всё», «вы такого не видели», «никто не ожидал», «тайна», «загадочный», «невероятный», «шокирующий», «эпичный», «только начинается», «пошло не по плану», «меняет правила игры», схема «X, но Y».
9. Без эмодзи, хештегов, обращений к зрителю и точки в конце.

ФОРМА
Русский язык, 3–9 слов, не больше 50 символов с пробелами (заголовок делится на две строки по 25 знаков).

ФОРМАТ ОТВЕТА
${p.scene}
ВАРИАНТЫ:
1. заголовок
2. заголовок
3. заголовок
4. заголовок
ХУК: лучший вариант, дословно как в списке

Варианты пиши с разных углов (звёзды, награда, создатели, сезон, сюжет) — только с тех, для которых есть основания, и с разным началом фразы. Лучший — самый сильный честный факт, который подходит отрывку.
    `.trim()
}

const HOOK_DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash']

// Видео Gemini иногда отклоняет без объяснений («Request blocked due to prohibited
// content guidelines»), причём тот же ролик час назад проходил. Поэтому ролик
// запрашивается по кругу у каждой модели, а если он так и не прошёл, хук
// строится только по описанию фильма. Шаблонный хук остаётся последним
// запасным вариантом (prepareReel).
const HOOK_VIDEO_ROUNDS = 2
const HOOK_TEXT_ROUNDS = 1
const HOOK_REQUEST_TIMEOUT_MS = 90_000
const HOOK_DEFAULT_BUDGET_MS = 4 * 60_000
// Время, которое видеозапросы оставляют текстовому хуку.
const HOOK_TEXT_RESERVE_MS = 60_000

// REEL_HOOK_MODELS: модели через запятую, по порядку.
export const hookModels = (env: NodeJS.ProcessEnv = process.env): string[] => {
    const configured = (env.REEL_HOOK_MODELS ?? '')
        .split(',')
        .map(name => name.trim())
        .filter(Boolean)

    return [...new Set(configured.length ? configured : HOOK_DEFAULT_MODELS)]
}

// REEL_HOOK_BUDGET_MS: общее время всего получения хука (30 с – 15 мин, по умолчанию 4 мин).
export const hookBudgetMs = (env: NodeJS.ProcessEnv = process.env): number => {
    const raw = env.REEL_HOOK_BUDGET_MS

    if (raw === undefined || raw.trim() === '') {
        return HOOK_DEFAULT_BUDGET_MS
    }

    const value = Number(raw)

    return Number.isFinite(value) && value >= 30_000 && value <= 15 * 60_000
        ? value
        : HOOK_DEFAULT_BUDGET_MS
}

// Запрос отклонён фильтрами контента (а не перегрузкой или неверным запросом).
export const isBlockedError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error)

    return /prohibited[_ ]content|blocked due to|content guidelines|block_?reason/iu.test(message)
}

type HookInputPart =
    | { type: 'text', text: string }
    | { type: 'video', uri: string, mime_type: string }

type HookResult = {
    hook: string
    parsed: ParsedHookResponse
    model: string
    durationMs: number
}

// Один проход по моделям, rounds раз: первый удачный ответ возвращается.
// Каждая неудача (блокировка, 503, зависший запрос, непригодный хук) передаёт
// ход следующей модели. Исчерпание общего времени прерывает всё.
const requestHook = async ({ai, models, rounds, source, input, interactionIds, facts}: {
    ai: GoogleGenAI
    models: string[]
    rounds: number
    source: HookSource
    input: HookInputPart[]
    interactionIds: string[]
    facts?: HookFacts
}): Promise<HookResult> => {
    let lastError: unknown

    for (let round = 1; round <= rounds; round++) {
        for (const model of models) {
            const startedAt = Date.now()

            try {
                const interaction = await withinBudget(
                    `Gemini hook (${model})`,
                    () => ai.interactions.create(
                        {
                            model,

                            generation_config: {
                                thinking_level: 'low'
                            },

                            input
                        },
                        {
                            // Ограничиваем ожидание одного запроса.
                            timeout_ms: 60_000,

                            // Вместо неограниченного по времени
                            // attempt-count-backoff используем backoff
                            // с контролем общего времени повторов.
                            retries: {
                                strategy: 'backoff',

                                backoff: {
                                    initialInterval: 1_000,
                                    maxInterval: 5_000,
                                    exponent: 2,
                                    maxElapsedTime: 15_000
                                },

                                retryConnectionErrors: true
                            },

                            // Повторяем именно временный 503.
                            retry_codes: ['503']
                        }
                    ),
                    HOOK_REQUEST_TIMEOUT_MS
                )

                if (interaction.id) {
                    interactionIds.push(interaction.id)
                }

                const durationMs = Date.now() - startedAt

                console.log('[GEMINI] Foreground interaction returned:', {
                    interactionId: interaction.id,
                    status: interaction.status,
                    source,
                    model,
                    durationMs
                })

                if (interaction.status !== 'completed') {
                    const interactionDiagnostics = interaction as typeof interaction & {
                        errors?: Array<{
                            code?: string
                            message?: string
                        }>
                    }

                    console.error('[GEMINI] Interaction did not complete:', {
                        interactionId: interaction.id,
                        status: interaction.status,
                        errors: interactionDiagnostics.errors ?? [],
                        model: interaction.model,
                        created: interaction.created,
                        updated: interaction.updated,
                        durationMs
                    })

                    throw new Error(
                        `[GEMINI] Interaction ended with status: ${interaction.status}`
                    )
                }

                const rawOutput = String(interaction.output_text ?? '')

                const parsed = parseHookResponse(rawOutput)
                const hook = selectHook(parsed, facts)

                if (!hook) {
                    const rejected =
                        parsed.chosen ??
                        rawOutput.replace(/\s+/g, ' ').trim()

                    throw new Error(
                        `[GEMINI] Invalid generated hook: "${rejected}" (${countWords(rejected)} words)`
                    )
                }

                return {hook, parsed, model, durationMs}

            } catch (error) {
                if (isBudgetExceeded(error)) {
                    throw error
                }

                lastError = error

                const details = getErrorDetails(error)

                console.warn('[GEMINI HOOK ATTEMPT FAILED]', {
                    source,
                    model,
                    round,
                    blocked: isBlockedError(error),
                    name: details.name,
                    message: details.message,
                    status: details.status,
                    durationMs: Date.now() - startedAt
                })
            }
        }
    }

    throw lastError
}

const logGeneratedHook = (source: HookSource, result: HookResult) => {
    const {hook, parsed, model, durationMs} = result
    const slopMatches = findSlop(hook)

    if (slopMatches.length) {
        console.warn('[GEMINI HOOK SLOP]', {
            hook,
            slopMatches
        })
    }

    // candidates и analysis пишем в лог: по ним видно, где модель
    // сворачивает к пересказу кадра, и можно подстраивать промпт.
    console.log('[GEMINI HOOK GENERATED]', {
        hook,
        source,
        model,
        wordCount: countWords(hook),
        candidates: parsed.candidates,
        analysis: parsed.analysis,
        durationMs
    })
}

/** Один хук: ветка без проверки администратора (как раньше). */
export const generateInstagramHookFromVideo = async (
    videoPath: string,
    context: InstagramHookContext
): Promise<string> =>
    (await requestHookFromVideo(videoPath, context)).hook

/**
 * До четырёх разных хуков по одному ролику для выбора администратором.
 * Промпт и так просит четыре варианта (ВАРИАНТЫ 1–4) и лучший (ХУК); раньше наружу уходил
 * только лучший. Здесь отдаются все пригодные (те же правила: 3–7 слов, без дублей), лучший
 * первым. Если модель вернула меньше четырёх пригодных, вариантов меньше; пустой список
 * не возвращается (тогда ошибка, как у одиночного хука).
 */
export const generateInstagramHookOptionsFromVideo = async (
    videoPath: string,
    context: InstagramHookContext
): Promise<string[]> => {
    const result = await requestHookFromVideo(videoPath, context)

    // Сначала варианты по правилам одиночного хука (3–7 слов, без штампов первыми),
    // затем остальные варианты модели до OPTION_MAX_WORDS слов: модель часто пишет 8–9
    // слов, и строгое правило оставляло администратору один вариант из четырёх (11.11).
    // Длинный хук подложка ужимает сама.
    const ranked = rankHooks(result.parsed, context.facts)
    const seen = new Set(ranked.map(hook => hook.toLowerCase()))
    const longer = result.parsed.candidates.filter(hook => {
        const words = countWords(hook)
        const fresh = !seen.has(hook.toLowerCase())
        seen.add(hook.toLowerCase())
        return fresh && words >= HOOK_MIN_WORDS && words <= OPTION_MAX_WORDS &&
            hook.toUpperCase() !== HOOK_UNDETERMINED && isHonest(hook, context.facts)
    })
    const options = [...ranked, ...longer].slice(0, HOOK_OPTIONS_COUNT)

    // rankHooks пуст быть не может: requestHook уже нашёл в этом ответе хук.
    return options.length ? options : [result.hook]
}

const requestHookFromVideo = async (
    videoPath: string,
    context: InstagramHookContext
): Promise<HookResult> => {

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
        throw new Error('[GEMINI] GEMINI_API_KEY is missing')
    }

    const ai = new GoogleGenAI({apiKey})
    const models = hookModels()

    let uploadedFileName: string | undefined
    const interactionIds: string[] = []

    // Ролик не принят (блокировка, перегрузка, сбой загрузки): хук по описанию.
    const generateFromVideo = async (): Promise<HookResult> => {
        console.log('[GEMINI] Uploading prepared video:', videoPath)

        // Загружаем локальный clean MP4 непосредственно в Gemini.
        const uploadedFile = await withinBudget(
            'Gemini video upload',
            () => ai.files.upload({
                file: videoPath,
                config: {
                    mimeType: 'video/mp4'
                }
            }),
            120_000
        )

        uploadedFileName = uploadedFile.name

        if (!uploadedFile.name) {
            throw new Error('[GEMINI] File upload returned no file name')
        }

        const uploadedName = uploadedFile.name

        console.log('[GEMINI] Video uploaded:', {
            fileName: uploadedFile.name,
            state: uploadedFile.state,
            mimeType: uploadedFile.mimeType
        })

        // Ждём, пока Gemini обработает видео.
        const fileProcessingDeadline =
            Date.now() + GEMINI_FILE_PROCESSING_TIMEOUT_MS

        let readyFile = await withinBudget(
            'Gemini video status',
            () => ai.files.get({name: uploadedName}),
            30_000
        )

        while (readyFile.state !== 'ACTIVE') {
            if (readyFile.state === 'FAILED') {
                throw new Error('[GEMINI] Video processing failed')
            }

            if (Date.now() >= fileProcessingDeadline) {
                throw new Error(
                    `[GEMINI] Video processing timeout after ${GEMINI_FILE_PROCESSING_TIMEOUT_MS / 1_000} seconds`
                )
            }

            await sleep(GEMINI_FILE_POLL_INTERVAL_MS)

            readyFile = await withinBudget(
                'Gemini video status',
                () => ai.files.get({name: uploadedName}),
                30_000
            )
        }

        if (!readyFile.uri) {
            throw new Error('[GEMINI] Processed video file has no URI')
        }

        console.log('[GEMINI] Video is ACTIVE:', {
            fileName: readyFile.name,
            mimeType: readyFile.mimeType
        })

        console.log('[GEMINI] Starting foreground video analysis')

        const result = await requestHook({
            ai,
            models,
            rounds: HOOK_VIDEO_ROUNDS,
            source: 'video',
            interactionIds,
            facts: context.facts,
            input: [
                {
                    type: 'video',
                    uri: readyFile.uri,
                    mime_type: readyFile.mimeType || 'video/mp4'
                },
                {
                    type: 'text',
                    text: buildHookPrompt(context, 'video')
                }
            ]
        })

        logGeneratedHook('video', result)

        return result
    }

    const generateFromDescription = async (): Promise<HookResult> => {
        console.warn('[GEMINI] Video route failed; generating the hook from the film description')

        const result = await requestHook({
            ai,
            models,
            rounds: HOOK_TEXT_ROUNDS,
            source: 'text',
            interactionIds,
            facts: context.facts,
            input: [
                {
                    type: 'text',
                    text: buildHookPrompt(context, 'text')
                }
            ]
        })

        logGeneratedHook('text', result)

        return result
    }

    const budgetMs = hookBudgetMs()

    // Видеозапросы оставляют время на запасной текстовый хук.
    const textReserveMs = Math.min(HOOK_TEXT_RESERVE_MS, Math.floor(budgetMs / 3))

    try {
        return await runWithBudget(budgetMs, async () => {
            try {
                return await withBudgetReserve(textReserveMs, generateFromVideo)

            } catch (videoError) {
                console.error('[GEMINI REQUEST FAILED]', getErrorDetails(videoError))

                // Без описания и названия строить хук не из чего.
                if (!context.overview?.trim() && !context.title?.trim()) {
                    throw videoError
                }

                try {
                    return await generateFromDescription()

                } catch (textError) {
                    console.error('[GEMINI TEXT HOOK FAILED]', getErrorDetails(textError))

                    // Наружу уходит первая причина: по ней видно, что случилось с роликом.
                    throw videoError
                }
            }
        })

    } finally {
        // Удаляем завершённые Interaction.
        for (const interactionId of interactionIds) {
            try {
                await ai.interactions.delete(interactionId)

                console.log('[GEMINI] Interaction deleted:', interactionId)

            } catch (error) {
                console.error(
                    '[GEMINI INTERACTION DELETE ERROR]',
                    getErrorDetails(error)
                )
            }
        }

        // Удаляем загруженное видео.
        if (uploadedFileName) {
            try {
                await ai.files.delete({
                    name: uploadedFileName
                })

                console.log('[GEMINI] Uploaded video deleted:', uploadedFileName)

            } catch (error) {
                console.error(
                    '[GEMINI FILE DELETE ERROR]',
                    getErrorDetails(error)
                )
            }
        }
    }
}

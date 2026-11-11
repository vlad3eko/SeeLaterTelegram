
import {GoogleGenAI} from "@google/genai"
import {
    isBudgetExceeded,
    runWithBudget,
    withBudgetReserve,
    withinBudget
} from "#server/global/engine/instagram/reel/subtitle/utils/budget"

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
const HOOK_MAX_WORDS = 7

// decorateInstagramVideo делит хук на две строки по ~25 знаков.
// Хук длиннее не считается ошибкой (шрифт ужмётся), но такие варианты
// выбираем в последнюю очередь.
const HOOK_PREFERRED_MAX_CHARS = 50

const HOOK_UNDETERMINED = 'НЕ УДАЛОСЬ ОПРЕДЕЛИТЬ'

const wordStart = (stems: string) =>
    new RegExp(`(?<![а-яё])(?:${stems})`, 'iu')

// Штампы, которые модель выдаёт рефлекторно. Список повторяет блок
// «АНТИ-ШТАМП» из промпта. Фильтр мягкий: из кандидатов предпочитаем хук
// без штампов, но если чистых нет, отдаём выбор модели. Жёсткий отказ
// привёл бы к шаблонному хуку-заглушке из createInstagramHook, а он хуже.
const HOOK_SLOP_PATTERNS: Array<{ label: string, pattern: RegExp }> = [
    {
        label: 'тайна',
        pattern: wordStart('тайн|таинств|загадоч|секретн|истинн|роков')
    },
    {
        label: 'бой и вражда',
        pattern: wordStart('борьб|схватк|сраж|битв|драк|враг|вражд|вражеск|ненавид')
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

const cleanHook = (value: string) =>
    value
        .replace(/\s+/g, ' ')
        .replace(/\s*\([^)]*\)\s*$/u, '')
        .replace(/^["'«“„]+|["'»”]+$/gu, '')
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

// Ответ модели: КАДР / СДВИГ / КЛЮЧ / ВАРИАНТЫ (1–4) / ХУК.
// Промежуточные строки нужны модели, чтобы реально проанализировать сцену,
// а не пересказать кадр. Наружу отдаётся только итоговый хук.
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
        const label = line.match(/^(КАДР|СДВИГ|КЛЮЧ|ХУК)\s*:\s*(.*)$/iu)

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
const rankHooks = ({chosen, candidates}: ParsedHookResponse): string[] => {
    // Модель сама сказала, что сцену определить нельзя.
    if (chosen?.toUpperCase() === HOOK_UNDETERMINED) {
        return []
    }

    const pool = new Map<string, string>()

    for (const item of [chosen, ...candidates]) {
        if (item && isValidHook(item) && !pool.has(item.toLowerCase())) {
            pool.set(item.toLowerCase(), item)
        }
    }

    const penalty = (hook: string) =>
        findSlop(hook).length * 10 +
        (hook.length > HOOK_PREFERRED_MAX_CHARS ? 1 : 0)

    return [...pool.values()].sort((a, b) => penalty(a) - penalty(b))
}

const selectHook = (parsed: ParsedHookResponse): string | undefined =>
    rankHooks(parsed)[0]

/** Сколько вариантов показывается администратору при ручной проверке (кнопки 1–4). */
export const HOOK_OPTIONS_COUNT = 4

/** Вариант для выбора администратором может быть длиннее одиночного хука. */
const OPTION_MAX_WORDS = 10


type HookSource = 'video' | 'text'

// Что меняется в промпте, когда ролика нет: хук строится только по описанию фильма.
// Вариант 'video' дословно совпадает с прежним промптом.
const HOOK_PROMPT_PARTS: Record<HookSource, {
    infoHeading: string
    basis: string
    fact: string
    truthNouns: string
    truthScene: string
    frameLine: string
    undetermined: string
}> = {
    video: {
        infoHeading: 'Информация о фильме (только для контекста тона и деталей):',
        basis: 'Основа хука — видео, а не твои знания о фильме. Название и описание помогают не ошибиться в деталях, но не источник того, что происходит в сцене.',
        fact: 'ФАКТ — то, что зритель видит в первые секунды: кто (по роли) и что делает.',
        truthNouns: '- Каждое существительное и определение должно быть видно в кадре или прозвучать/появиться в субтитрах. Если слова нет в видео (робот, заброшенный, тайный), убери его.',
        truthScene: '- ФАКТ из хука виден в первые секунды ролика, ответ на дыру приходит ближе к концу.\n- Слушай реплики и субтитры: если реплика называет ставку или цель героев, строй дыру на ней.',
        frameLine: 'КАДР: кто (по роли), что делает и где; только то, что видно или слышно',
        undetermined: 'Если невозможно достоверно определить происходящее в видео, ответь одной строкой:\nХУК: НЕ УДАЛОСЬ ОПРЕДЕЛИТЬ\nЕсли сцена видна хотя бы частично, строй хук по тому, что определяется уверенно.'
    },
    text: {
        infoHeading: 'Информация о фильме (единственный источник для хука):',
        basis: 'Видео ты не видел: основа хука — только название, жанры и описание фильма. Не опирайся на свои знания о фильме и не выдумывай события, которых в описании нет.',
        fact: 'ФАКТ — то, что названо в описании: кто (по роли) и что делает.',
        truthNouns: '- Каждое существительное и определение должно быть в описании фильма. Если слова там нет (робот, заброшенный, тайный), убери его.',
        truthScene: '- ФАКТ из хука берётся из описания, а дыра — то, что описание оставляет открытым. Не обещай ответа, которого нет в описании.',
        frameLine: 'КАДР: кто (по роли) и что делает; только то, что названо в описании',
        undetermined: 'Если по описанию невозможно построить правдивый хук, ответь одной строкой:\nХУК: НЕ УДАЛОСЬ ОПРЕДЕЛИТЬ\nЕсли описание даёт хотя бы одну конкретную деталь, строй хук по ней.'
    }
}

export const buildHookPrompt = (
    context: InstagramHookContext,
    source: HookSource = 'video'
): string => {
    const p = HOOK_PROMPT_PARTS[source]
    const genreText = getGenreText(context.genre)

    return `
Ты — монтажёр коротких Instagram Reels о кино. Твой хук — текст из 3–7 слов поверх кадра в первые секунды. Его читают без звука за пару секунд и решают: смотреть дальше или пролистнуть.

Хук нужен, чтобы зритель досмотрел ролик (около 40 секунд) до ответа, а не чтобы описать сцену. Описание кадра зритель и так видит глазами, поэтому оно не удерживает. Хук задаёт вопрос, ответ на который есть в этом ролике.

${p.infoHeading}
Название: ${context.title || 'Не указано'}
Жанры: ${genreText || 'Не указаны'}
Описание фильма: ${context.overview || 'Не указано'}

${p.basis}

ПРИНЦИП: ФАКТ + ДЫРА
${p.fact}
ДЫРА — то, чего он не понимает и что раскроется ближе к концу ролика: почему, зачем, какой ценой, чем кончится.
Хук даёт ФАКТ и оставляет ДЫРУ. Если после прочтения можно ответить «ну и что?», это констатация, а не хук.

СПОСОБЫ СДЕЛАТЬ ДЫРУ
Выбирай тот, что реально есть в сцене. Примеры на выдуманных сценах: переноси приём, а не слова.

1. Роли наоборот: неспециалист спорит, командует или сомневается там, где разбирается другой.
   Было: «Метеоролог спорит с генералом о погоде»
   Стало: «Генерал спорит о погоде с метеорологом»
   Подлежащее — тот, кто стоит не на своём месте. Специалист — в конец фразы, это слово-удар. Приём только если такое несоответствие есть в кадре.
2. Поступок без объяснённой причины.
   Было: «Сапёр обезвреживает бомбу»
   Стало: «Сапёр перерезал провод и улыбнулся»
3. Неправильная реакция.
   Было: «Семья слушает завещание»
   Стало: «На оглашении завещания никто не удивился»
4. Странная деталь.
   Было: «Девочка входит в пустой дом»
   Стало: «В пустом доме накрыт стол на четверых»
5. Цена или срок.
   Было: «Хирург оперирует раненого»
   Стало: «У хирурга один шприц на двоих»
6. Выбор с неизвестным исходом.
   Было: «Капитан решает, кого спасать»
   Стало: «Капитан называет, кто останется на берегу»
7. Видимое и настоящее не совпадают.
   Было: «Детектив допрашивает свидетеля»
   Стало: «Свидетель знает о деле больше детектива»
8. Бой, погоня, перестрелка: пиши не про бой, а про то, что в нём странно (условие, цена, неожиданный участник).
   Было: «Спецназовец сражается с монстром»
   Стало: «Спецназовец отдал монстру последний патрон»

ПОРЯДОК СЛОВ
Начинай с того, чьё действие вызывает вопрос: конкретная роль, существо или предмет, не местоимение и не абстракция.
Последнее слово — самое неожиданное или весомое: профессия, предмет, число, место. Слабые слова («о погоде», «в доме», «в городе», «вместе», «начинается») в конец не ставь.

НАПРЯЖЕНИЕ БЕЗ ВРАЖДЫ
Любопытство вызывает несоответствие, а не ссора. Не используй слова «борьба», «схватка», «сражается», «битва», «драка», «враг», «война», «ненавидит» и схему «X против Y».
Спор, допрос, разговор показывай через то, что в нём не сходится, а не словами «ссорятся» или «конфликтуют».

АНТИ-ШТАМП
Так пишет нейросеть: зритель это чувствует и листает.
Запрещённые слова: тайна, тайный, секретный, таинственный, загадочный, истинный, роковой, смертельный, жестокий, эпичный, невероятный, шокирующий, навсегда.
Запрещённые конструкции: «X, но Y» («Империя пала, но война только начинается»); «только начинается»; «пошло не по плану»; «зашло слишком далеко»; «оборачивается»; «меняет правила игры» и «меняет всё»; «раскрывает правду» и «раскрывает имя»; «не А, а Б»; перечисления из трёх.
Подлежащее — всегда живое существо или предмет из кадра. Абстрактные существительные в подлежащем («борьба», «тайна», «скандалы», «чудеса», «разговор», «падение») запрещены.
Тест вслух: скажи хук так, как сказал бы другу в мессенджере, чтобы он включил этот ролик. Если звучит как анонс телепрограммы или аннотация к фильму, перепиши проще и конкретнее.

ПРАВДА
Зритель, которого обманули, уходит.
${p.truthNouns}
- Дыра закрывается в этом ролике. Не создавай загадку без ответа в видео и не обещай того, чего зритель не увидит. Не выдумывай события, мотивы и связи.
${p.truthScene}
- Не раскрывай концовку и не пересказывай фильм.
- Известный персонаж или франшиза: не называй очевидное («Человек-паук сражается»). Найди, что необычного именно в этом фрагменте.

ФОРМА ХУКА
- Русский язык, 3–7 слов, не больше 45 символов с пробелами (хук делится на две строки по 25 знаков).
- Персонажей называй по роли. Имена используй только если они звучат или показаны в кадре. Название фильма и имена актёров не используй.
- Без оценок и обещаний впечатления («шокирует», «невозможно оторваться»), без обращений к зрителю, без эмодзи, без точки в конце.
- Вопрос допустим, если он начинается с «почему», «зачем», «что» или «кто» и ответ на него есть в ролике. Не ставь вопрос просто для вида.
- Тон по жанру: ужасы — угроза, комедия — абсурд, драма — цена выбора, боевик — риск.

ФОРМАТ ОТВЕТА
Отвечай строго в таком виде, каждая строка — одно короткое предложение:
${p.frameLine}
СДВИГ: что в этой сцене не на своём месте, нелогично, не договорено или поставлено на кон
КЛЮЧ: что объяснится к концу ролика и примерно в какой момент
ВАРИАНТЫ:
1. хук
2. хук
3. хук
4. хук
ХУК: лучший вариант, дословно как в списке

В вариантах используй разные способы сделать дыру и разное начало фразы.
Лучший вариант — тот, который проходит все тесты: на него нельзя ответить «ну и что?», он звучит живой речью, а ответ на него есть в ролике.

${p.undetermined}
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
const requestHook = async ({ai, models, rounds, source, input, interactionIds}: {
    ai: GoogleGenAI
    models: string[]
    rounds: number
    source: HookSource
    input: HookInputPart[]
    interactionIds: string[]
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
                const hook = selectHook(parsed)

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
    const ranked = rankHooks(result.parsed)
    const seen = new Set(ranked.map(hook => hook.toLowerCase()))
    const longer = result.parsed.candidates.filter(hook => {
        const words = countWords(hook)
        const fresh = !seen.has(hook.toLowerCase())
        seen.add(hook.toLowerCase())
        return fresh && words >= HOOK_MIN_WORDS && words <= OPTION_MAX_WORDS &&
            hook.toUpperCase() !== HOOK_UNDETERMINED
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

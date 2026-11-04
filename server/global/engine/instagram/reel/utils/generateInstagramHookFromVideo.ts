
import {GoogleGenAI} from "@google/genai"

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

export const generateInstagramHookFromVideo = async (
    videoPath: string,
    context: InstagramHookContext
): Promise<string> => {

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
        throw new Error('[GEMINI] GEMINI_API_KEY is missing')
    }

    const ai = new GoogleGenAI({apiKey})

    let uploadedFileName: string | undefined
    let interactionId: string | undefined
    let interactionIsTerminal = false
    let interactionStartedAt = Date.now()

    try {
        console.log('[GEMINI] Uploading prepared video:', videoPath)

        // Загружаем локальный clean MP4 непосредственно в Gemini.
        const uploadedFile = await ai.files.upload({
            file: videoPath,
            config: {
                mimeType: 'video/mp4'
            }
        })

        uploadedFileName = uploadedFile.name

        if (!uploadedFile.name) {
            throw new Error('[GEMINI] File upload returned no file name')
        }

        console.log('[GEMINI] Video uploaded:', {
            fileName: uploadedFile.name,
            state: uploadedFile.state,
            mimeType: uploadedFile.mimeType
        })

        // Ждём, пока Gemini обработает видео.
        const fileProcessingDeadline =
            Date.now() + GEMINI_FILE_PROCESSING_TIMEOUT_MS

        let readyFile = await ai.files.get({
            name: uploadedFile.name
        })

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

            readyFile = await ai.files.get({
                name: uploadedFile.name
            })
        }

        if (!readyFile.uri) {
            throw new Error('[GEMINI] Processed video file has no URI')
        }

        console.log('[GEMINI] Video is ACTIVE:', {
            fileName: readyFile.name,
            mimeType: readyFile.mimeType
        })

        const genreText = getGenreText(context.genre)

        const prompt = `
Ты — сценарист коротких Instagram Reels о кино. Твой хук будет текстом поверх видео в первые секунды, его читают без звука, глядя на кадр.

Перед тобой выбранный фрагмент реального фильма.
Тебе необходимо проанализировать именно происходящее в видео.

Информация о фильме:
Название: ${context.title || 'Не указано'}
Жанры: ${genreText || 'Не указаны'}
Описание фильма: ${context.overview || 'Не указано'}

ВАЖНО:
Название, жанры и описание нужны только для контекста: они помогают понять тон и не ошибиться в деталях.
Основой для хука должно быть именно видео, а не твои знания о фильме.
Хук должен быть частью видео: зритель смотрит на кадр и читает фразу, они должны совпадать. Но хук не пересказывает кадр, а заставляет досмотреть до ответа.

Твоя задача:
1. Про себя определи по видео: кто в кадре (по роли: сапёр, детектив, школьница, миллиардер), что он делает, где, в чём ставка или конфликт, что в происходящем странно, опасно, нелогично или не договорено.
2. Раздели найденное на две части:
   — ФАКТ: то, что точно видно или слышно во фрагменте (конкретный человек или существо, действие, предмет, место);
   — КЛЮЧ: то, чего зритель пока не понимает и что раскроется при просмотре (причина, цена, смысл, исход, личность, способ).
3. Напиши хук так, чтобы в нём был ФАКТ, а КЛЮЧ остался недосказанным. Зритель должен узнать, о чём сцена, и не узнать главного.

Способы оставить ключ открытым (выбери один, самый подходящий сцене):
— деталь, которая не вяжется с ситуацией (странный предмет, неожиданный поступок, неправильная реакция);
— действие без объяснённой причины («зачем», «почему» — но только если причину действительно раскрывает видео);
— ставка с неизвестной ценой или сроком;
— выбор или решение с неочевидным исходом;
— контраст между тем, что видно, и тем, что на самом деле происходит.
— нарушенная иерархия компетенций: неспециалист спорит, командует или сомневается в чужой профессии (генерал спорит с врачом, режиссёр учит пилота). Поставь специалиста или самую неожиданную роль в конец фразы.
— Самое неожиданное или самое весомое слово ставь в конец фразы: оно запоминается и держит интригу. Слабые слова («о погоде», «в доме», «в городе») не должны стоять последними.

Требования:
- Русский язык.
- Минимум 3 слова, максимум 7.
- Подлежащее — конкретное существительное из сцены (роль, профессия, существо, предмет, место), а не местоимение. Начинай с него, с числа или с яркого действия.
- Одна конкретная деталь, которая делает фразу узнаваемой именно для этой сцены.
- Тест подмены: если фразу можно повесить на другой фильм, перепиши её конкретнее.
- Тест интриги: если после прочтения хука нет вопроса «и что дальше?» или «почему?», хук просто описывает кадр, перепиши с недосказанностью.
- Тест честности: ключ, который ты оставляешь открытым, должен реально раскрываться в этой сцене или рядом с ней. Не создавай загадку, ответа на которую нет в видео, и не обещай того, чего зритель не увидит.
- Не выдумывай события, мотивы и связи. Интрига строится на недосказанности, а не на выдумке.
- Если используешь вопрос, он не должен быть вопросом «да или нет»: начинай с «почему», «зачем», «что», «кто».
- Не называй персонажей по именам, если имена не звучат и не показаны в кадре. Называй их по роли. Название фильма и имена актёров в хуке не используй.
- Не раскрывай концовку и не пересказывай фильм.
- Никаких оценок и обещаний о впечатлении («шокирует», «разобьёт сердце», «невозможно оторваться») и обращений к зрителю.
- Тон подстраивай под жанр: в ужасах чувствуется угроза, в комедии абсурд, в драме цена выбора, в боевике риск. Без рекламной интонации.
- Строй фразу вокруг живого глагола или контраста, а не вокруг слов «борьба», «драка», «битва», «сражение». Не начинай подряд с одной и той же схемы «X против Y» / «X сражается с Y».
- Каждое существительное и определение в хуке должно быть видно в кадре или прозвучать/появиться в субтитрах. Если слова нет в видео (робот, заброшенный, тайный), убери его. Описание фильма не источник деталей сцены.
- Прислушайся к репликам и субтитрам: если реплика называет ставку или цель героев, построй ключ на ней.
- Если в кадре известный персонаж или франшиза, не называй очевидное («Человек-паук сражается»). Покажи, что необычного именно в этом фрагменте: настроение, неожиданное условие, контраст.
- Без оценочных прилагательных («жестокая», «эпичная») и без точки в конце.

Образцы уровня конкретности и интриги (сюжеты выдуманные, не копируй слова и конструкции, строй хук только под свою сцену):
Сапёр нашёл на мине своё имя
Почему учитель прячет чужого ребёнка в классе
Чемпион проигрывает партию нарочно. Но зачем?
Из колодца во дворе доносится стук
Пилот скрывает, что увидел над океаном
Последний автобус уезжает без водителя
Конструкции хуков должны различаться: не повторяй одну схему из ролика в ролик.

Перед ответом проверь про себя: в хуке есть факт из видео, ключ оставлен недосказанным, нет местоимений вместо героя, 3–7 слов, нет спойлера и выдуманных фактов.

Если невозможно достоверно определить происходящее в видео,
верни строго: НЕ УДАЛОСЬ ОПРЕДЕЛИТЬ.
Если сцена видна хотя бы частично, выбирай то, что определяется уверенно, и пиши хук по нему.

Верни только один готовый хук.
Без кавычек, эмодзи, списков и пояснений.
        `.trim()


        console.log('[GEMINI] Starting foreground video analysis')

        const interaction = await ai.interactions.create(
            {
                model: 'gemini-3.5-flash-lite',

                generation_config: {
                    thinking_level: 'low'
                },

                input: [
                    {
                        type: 'video',
                        uri: readyFile.uri,
                        mime_type: readyFile.mimeType || 'video/mp4'
                    },
                    {
                        type: 'text',
                        text: prompt
                    }
                ]
            },
            {
                // Ограничиваем ожидание одного запроса.
                timeout_ms: 180_000,

                // Вместо неограниченного по времени
                // attempt-count-backoff используем backoff
                // с контролем общего времени повторов.
                retries: {
                    strategy: 'backoff',

                    backoff: {
                        initialInterval: 1_000,
                        maxInterval: 5_000,
                        exponent: 2,
                        maxElapsedTime: 30_000
                    },

                    retryConnectionErrors: true
                },

                // Повторяем именно временный 503.
                retry_codes: ['503']
            }
        )

        interactionId = interaction.id
        interactionIsTerminal = true

        const interactionElapsedMs =
            Date.now() - interactionStartedAt

        console.log('[GEMINI] Foreground interaction returned:', {
            interactionId,
            status: interaction.status,
            durationMs: interactionElapsedMs
        })

        if (interaction.status !== 'completed') {
            const interactionDiagnostics = interaction as typeof interaction & {
                errors?: Array<{
                    code?: string
                    message?: string
                }>
            }

            console.error('[GEMINI] Interaction did not complete:', {
                interactionId,
                status: interaction.status,
                errors: interactionDiagnostics.errors ?? [],
                model: interaction.model,
                created: interaction.created,
                updated: interaction.updated,
                durationMs: interactionElapsedMs
            })

            throw new Error(
                `[GEMINI] Interaction ended with status: ${interaction.status}`
            )
        }

        const hook = String(interaction.output_text ?? '')
            .replace(/\s+/g, ' ')
            .replace(/^["'«“]+|["'»”]+$/g, '')
            .trim()

        const wordCount = hook.split(/\s+/).filter(Boolean).length

        if (
            !hook ||
            hook === 'НЕ УДАЛОСЬ ОПРЕДЕЛИТЬ' ||
            wordCount < 3 ||
            wordCount > 7
        ) {
            throw new Error(
                `[GEMINI] Invalid generated hook: "${hook}" (${wordCount} words)`
            )
        }

        console.log('[GEMINI HOOK GENERATED]', {
            hook,
            wordCount,
            durationMs: interactionElapsedMs
        })

        return hook

    } catch (error) {
        console.error('[GEMINI REQUEST FAILED]', getErrorDetails(error))
        throw error

    } finally {
        // Удаляем завершённый Interaction.
        if (interactionId && interactionIsTerminal) {
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

        // Удаляем загруженное видео, если Interaction
        // не создавался или уже завершился.
        if (uploadedFileName && (!interactionId || interactionIsTerminal)) {
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

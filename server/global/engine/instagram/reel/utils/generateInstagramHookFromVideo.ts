
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
Ты — сценарист коротких Instagram Reels о кино.

Перед тобой выбранный фрагмент реального фильма.
Тебе необходимо проанализировать именно происходящее в видео.

Информация о фильме:
Название: ${context.title || 'Не указано'}
Жанры: ${genreText || 'Не указаны'}
Описание фильма: ${context.overview || 'Не указано'}

ВАЖНО:
Название и описание нужны только для контекста.
Основой для хука должно быть именно видео, а не твои знания о фильме.

Твоя задача:
1. Определи, что конкретно происходит в показанной сцене.
2. Найди наиболее интересное действие, конфликт, неожиданность или интригу.
3. На основе увиденного напиши один короткий хук для Reels.

Требования:
- Русский язык.
- Минимум 3 слова.
- Максимум 7 слов.
- Фраза должна передавать происходящее в сцене.
- Создавай интригу, но не выдумывай события.
- Не пересказывай весь фильм.
- Не раскрывай концовку.
- Не используй общие фразы вроде "Этот фильм заставит задуматься".
- Не начинай с "В этой истории", "В этом фильме".
- Не используй искусственный рекламный тон.

Если невозможно достоверно определить происходящее в видео,
верни строго: НЕ УДАЛОСЬ ОПРЕДЕЛИТЬ.

Верни только один готовый хук.
Без кавычек, списков и пояснений.
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

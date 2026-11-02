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

const GEMINI_POLL_INTERVAL_MS = 5_000
const GEMINI_INTERACTION_TIMEOUT_MS = 5 * 60 * 1_000
const GEMINI_STATUS_LOG_INTERVAL_MS = 15_000

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

const isTerminalInteractionStatus = (status?: string): boolean =>
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled'

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
        const fileProcessingDeadline = Date.now() + 90_000

        let readyFile = await ai.files.get({
            name: uploadedFile.name
        })

        while (readyFile.state !== 'ACTIVE') {
            if (readyFile.state === 'FAILED') {
                throw new Error('[GEMINI] Video processing failed')
            }

            if (Date.now() >= fileProcessingDeadline) {
                throw new Error('[GEMINI] Video processing timeout after 90 seconds')
            }

            await sleep(2_000)

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

        console.log('[GEMINI] Starting background video analysis')

        // Background mode сразу возвращает ID задачи, не удерживая один HTTP-запрос
        // до завершения всей генерации.
        let interaction = await ai.interactions.create({
            model: 'gemini-3.8-flash',
            background: true,
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
        })

        interactionId = interaction.id

        if (!interactionId) {
            throw new Error('[GEMINI] Background interaction returned no ID')
        }

        const interactionStartedAt = Date.now()
        const interactionDeadline = interactionStartedAt + GEMINI_INTERACTION_TIMEOUT_MS
        let nextStatusLogAt = interactionStartedAt + GEMINI_STATUS_LOG_INTERVAL_MS

        console.log('[GEMINI] Background interaction created:', {
            interactionId,
            status: interaction.status
        })

        // Получаем результат отдельными короткими GET-запросами.
        while (interaction.status === 'in_progress') {
            if (Date.now() >= interactionDeadline) {
                throw new Error(
                    `[GEMINI] Background interaction timeout after ${GEMINI_INTERACTION_TIMEOUT_MS / 1_000}s (id: ${interactionId})`
                )
            }

            await sleep(GEMINI_POLL_INTERVAL_MS)

            interaction = await ai.interactions.get(interactionId)

            const elapsedMs = Date.now() - interactionStartedAt

            if (Date.now() >= nextStatusLogAt) {
                console.log('[GEMINI] Background interaction still running:', {
                    interactionId,
                    status: interaction.status,
                    elapsedSeconds: Math.round(elapsedMs / 1_000)
                })

                nextStatusLogAt = Date.now() + GEMINI_STATUS_LOG_INTERVAL_MS
            }
        }

        interactionIsTerminal = isTerminalInteractionStatus(interaction.status)

        if (interaction.status !== 'completed') {
            const interactionError = (interaction as typeof interaction & {
                error?: unknown
            }).error

            console.error('[GEMINI] Background interaction did not complete:', {
                interactionId,
                status: interaction.status,
                error: interactionError,
                elapsedSeconds: Math.round((Date.now() - interactionStartedAt) / 1_000)
            })

            throw new Error(
                `[GEMINI] Background interaction ended with status: ${interaction.status}`
            )
        }

        console.log('[GEMINI] Background interaction completed:', {
            interactionId,
            elapsedSeconds: Math.round((Date.now() - interactionStartedAt) / 1_000)
        })

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
            wordCount
        })

        return hook

    } catch (error) {
        console.error('[GEMINI REQUEST FAILED]', getErrorDetails(error))
        throw error

    } finally {
        // Если запрос оборвался до терминального статуса, пытаемся остановить его.
        // Файл не удаляем, пока не убедимся, что Interaction завершён/отменён:
        // иначе Gemini может потерять исходное видео во время анализа.
        if (interactionId && !interactionIsTerminal) {
            try {
                const cancelledInteraction = await ai.interactions.cancel(interactionId)
                interactionIsTerminal = isTerminalInteractionStatus(cancelledInteraction.status)

                console.warn('[GEMINI] Interaction cancellation result:', {
                    interactionId,
                    status: cancelledInteraction.status
                })
            } catch (error) {
                console.error('[GEMINI] Interaction cancellation failed:', getErrorDetails(error))
            }
        }

        // Удаляем запись Interaction, чтобы не хранить её в Gemini без необходимости.
        if (interactionId && interactionIsTerminal) {
            try {
                await ai.interactions.delete(interactionId)
                console.log('[GEMINI] Interaction deleted:', interactionId)
            } catch (error) {
                console.error('[GEMINI INTERACTION DELETE ERROR]', getErrorDetails(error))
            }
        }

        // Файл удаляем только если Interaction завершён или вообще не был создан.
        if (uploadedFileName && (!interactionId || interactionIsTerminal)) {
            try {
                await ai.files.delete({
                    name: uploadedFileName
                })

                console.log('[GEMINI] Uploaded video deleted:', uploadedFileName)
            } catch (error) {
                console.error('[GEMINI FILE DELETE ERROR]', getErrorDetails(error))
            }
        } else if (uploadedFileName && interactionId) {
            console.warn('[GEMINI] Keeping uploaded video because interaction may still be running:', {
                interactionId,
                uploadedFileName
            })
        }
    }
}

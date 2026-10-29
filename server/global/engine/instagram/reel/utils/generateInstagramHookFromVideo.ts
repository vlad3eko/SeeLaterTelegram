
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

const getGenreText = (genre?: GenreInput): string => {
    if (Array.isArray(genre)) {
        return genre
            .map(item => typeof item === 'string' ? item : item.name ?? '')
            .filter(Boolean)
            .join(', ')
    }

    return String(genre ?? '').trim()
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

        // Ждём, пока Gemini обработает видео.
        const deadline = Date.now() + 90_000

        let readyFile = await ai.files.get({
            name: uploadedFile.name || ''
        })

        while (readyFile.state !== 'ACTIVE') {
            if (readyFile.state === 'FAILED') {
                throw new Error('[GEMINI] Video processing failed')
            }

            if (Date.now() >= deadline) {
                throw new Error('[GEMINI] Video processing timeout')
            }

            await sleep(2000)

            readyFile = await ai.files.get({
                name: uploadedFile.name || ''
            })
        }

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

        console.log('[GEMINI] Analyzing prepared video')

        const interaction = await ai.interactions.create({
            model: 'gemini-3.8-flash',
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

        const hook = String(interaction.output_text ?? '')
            .replace(/\s+/g, ' ')
            .replace(/^["'«“]+|["'»”]+$/g, '')
            .trim()

        const wordCount = hook.split(/\s+/).filter(Boolean).length

        if (
            !hook ||
            hook === 'НЕ УДАЛОСЬ ОПРЕДЕЛИТЬ' ||
            wordCount < 2 ||
            wordCount > 7
        ) {
            throw new Error(
                `[GEMINI] Invalid generated hook: "${hook}"`
            )
        }

        console.log('[GEMINI HOOK GENERATED]', {
            hook,
            wordCount
        })

        return hook

    } finally {
        // Не оставляем загруженные видео в Gemini.
        if (uploadedFileName) {
            try {
                await ai.files.delete({
                    name: uploadedFileName
                })

                console.log('[GEMINI] Uploaded video deleted')
            } catch (error) {
                console.error('[GEMINI FILE DELETE ERROR]', error)
            }
        }
    }
}

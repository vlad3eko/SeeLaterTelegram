
import {Input} from "telegraf"
import {getTelegramMediaCache, setTelegramMediaCache} from "#server/global/engine/card/construct/getTelegramMediaCache";

type PersonImage = {
    id: number
    path?: string | null
    name?: string;
    role?: string;
    mediaType?: string
    releaseDate?: string
}

type TelegramMediaImages = {
    poster: (string | null | undefined)[]
    postersList: PersonImage[]
}

export const getTelegramMediaImages = async (
    ctx: any,
    mediaId: number,
    mediaType: 'movie' | 'tv' | 'person',
    images: TelegramMediaImages
) => {

    const items = [
        ...images.poster
            .filter(Boolean)
            .map(path => ({
                key: `${mediaType}_${mediaId}_poster_${path}`,
                path: path as string
            })),

        ...images.postersList
            .filter(person => person.path)
            .map(person => ({
                key: `person_${person.id}_profile_${person.path}`,
                path: person.path as string
            }))
    ].slice(0, 12)

    const result = new Map<string, string>()

    const needUpload: typeof items = []

    for (const item of items) {
        const cached = await getTelegramMediaCache(item.key)

        if (cached) {
            result.set(item.key, cached)
            continue
        }

        needUpload.push(item)
    }

    if (needUpload.length) {

        const first = needUpload[0]

        // Финализатор публикации строит карточку без ctx (constructRichCard(undefined, …)): у фильма,
        // чью карточку ни разу не открывали (автопубликация из очереди YouTube), постеров в кэше нет,
        // и загружать их приходится через самого бота.
        const telegram = ctx?.telegram ?? (await import('#server/bot/bot')).bot.telegram

        const uploadOne = (path: string) => telegram.sendPhoto(
            process.env.TELEGRAM_MEDIA_STORAGE_CHAT_ID,
            Input.fromURL(`https://image.tmdb.org/t/p/w780${path}`)
        )

        // Сообщение на каждый загружаемый файл (null — Telegram не смог скачать картинку).
        let messages: Array<any | null> = []

        if (needUpload.length === 1) {
            messages = [await uploadOne(first!.path).catch((error: any) => {
                console.warn('[TELEGRAM MEDIA] Poster upload failed; card without it', {path: first!.path, error: error?.response?.description ?? error?.message})
                return null
            })]
        } else {
            try {
                messages = await telegram.sendMediaGroup(
                    process.env.TELEGRAM_MEDIA_STORAGE_CHAT_ID,
                    needUpload.map(item => ({
                        type: 'photo' as const,
                        media: Input.fromURL(
                            `https://image.tmdb.org/t/p/w780${item.path}`
                        )
                    }))
                )
            } catch (error: any) {
                // Один недоступный постер («failed to get HTTP URL content») валил всю группу,
                // а с ней и карточку-список целиком. Повторяем по одному; недоступный — без картинки.
                console.warn('[TELEGRAM MEDIA] Group upload failed; uploading one by one', error?.response?.description ?? error?.message)
                messages = []
                for (const item of needUpload) {
                    messages.push(await uploadOne(item.path).catch((oneError: any) => {
                        console.warn('[TELEGRAM MEDIA] Poster upload failed; card without it', {path: item.path, error: oneError?.response?.description ?? oneError?.message})
                        return null
                    }))
                }
            }
        }

        await Promise.all(
            messages.map(async (message: any, index: number) => {

                const fileId =
                    message?.photo?.[message.photo.length - 1]?.file_id

                if (!fileId) {
                    return
                }

                const key = needUpload[index]!.key

                await setTelegramMediaCache(
                    key,
                    fileId
                )

                result.set(
                    key,
                    fileId
                )
            })
        )
    }

    return {
        poster: images.poster.map(path => {

            if (!path) {
                return null
            }

            return result.get(
                `${mediaType}_${mediaId}_poster_${path}`
            ) ?? null
        }),

        postersList: images.postersList
            .map(person => {

                if (!person.path) {
                    return null
                }

                const fileId =
                    result.get(
                        `person_${person.id}_profile_${person.path}`
                    )

                if (!fileId) {
                    return null
                }

                return {
                    id: person.id,
                    fileId,
                    name: person.name,
                    role: person.role,
                    mediaType: person.mediaType,
                    releaseDate: person.releaseDate,
                }
            })
            .filter(Boolean)
    }
}

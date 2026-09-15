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

        let messages: any[] = []

        if (needUpload.length === 1) {
            messages = [
                await ctx.telegram.sendPhoto(
                    process.env.TELEGRAM_MEDIA_STORAGE_CHAT_ID,
                    Input.fromURL(
                        `https://image.tmdb.org/t/p/w780${first!.path}`
                    )
                )
            ]
        } else {
            messages = await ctx.telegram.sendMediaGroup(
                process.env.TELEGRAM_MEDIA_STORAGE_CHAT_ID,
                needUpload.map(item => ({
                    type: 'photo' as const,
                    media: Input.fromURL(
                        `https://image.tmdb.org/t/p/w780${item.path}`
                    )
                }))
            )
        }

        await Promise.all(
            messages.map(async (message: any, index: number) => {

                const fileId =
                    message.photo?.[message.photo.length - 1]?.file_id

                if (!fileId) {
                    throw new Error(
                        `Telegram did not return file_id for ${needUpload[index]!.path}`
                    )
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

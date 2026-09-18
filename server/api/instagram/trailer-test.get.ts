import {prepareInstagramReel} from "#server/global/engine/instagram/prepareInstagramReel"

export default defineEventHandler(
    async (event) => {
        const query =
            getQuery(event)

        const keyTrailer =
            String(query.key || '')

        if (!keyTrailer) {
            throw createError({
                statusCode: 400,
                statusMessage:
                    'Trailer key is required'
            })
        }

        try {
            const result =
                await prepareInstagramReel(
                    keyTrailer
                )

            return {
                success: true,
                keyTrailer,
                ...result
            }
        } catch (error: any) {
            console.error(
                '[INSTAGRAM TRAILER TEST ERROR]',
                error
            )

            throw createError({
                statusCode: 500,
                statusMessage:
                    error?.message ||
                    'Trailer processing failed'
            })
        }

    }
)

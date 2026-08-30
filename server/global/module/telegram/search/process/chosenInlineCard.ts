import {createPersonCaption} from "~/utils/person/createPersonCaption";
import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";
import {isAdmin} from "#server/bot/consts/admins";
import {getKeyTrailer} from "#server/bot/consts/media/getKeyTrailer";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardPerson, keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {getPersonApi} from "#server/global/engine/search/repository/tmdbRepository";
import {Markup} from "telegraf";
import {SearchButtonBot} from "#server/bot/consts/buttons/buttonsBot";

export const chosenInlineCard = async (ctx: any) => {

    const result = ctx.update.chosen_inline_result
    const inlineMessageId = result?.inline_message_id

    if (!inlineMessageId) return

    if (result.result_id === 'no_search_results'
        || result.result_id === 'empty_collection') {
        return
    }

    try {

        const [
            ,
            mediaType,
            contentType,
            mediaId
        ] = result.result_id.split('_')

        const isPerson = mediaType === 'person'
            || contentType === 'person'

        let media
        let keyTrailer
        let keyboard
        let caption
        let image

        const admin = isAdmin(result.from.id)

        if (!isPerson) {

            media = await tmdbFetch('/api/bot/getMediaBot', {
                    query: {
                        media: mediaType,
                        id: mediaId
                    }
                }
            )

            const trailers = await tmdbFetch('/api/tmdb/trailers', {
                    query: {
                        media: mediaType,
                        id: mediaId
                    }
                }
            )

            keyTrailer = getKeyTrailer(trailers)

            image = media.backdrop_path
                || media.poster_path

            caption = createMediaCaption(media, contentType, undefined, undefined, keyTrailer)

            keyboard = keyboardSendMediaCardInline(
                Number(mediaId),
                mediaType,
                contentType,
                media.genres,
                admin,
                'inline',
                0,
                keyTrailer
            )

        } else {

            const person = await getPersonApi(mediaId)

            image = person.profile_path

            caption = createPersonCaption(person)

            const firstJob = convertTranslateKnowForDepartment(person.known_for_department)

            const secondJob = convertTranslateKnowForDepartment(person.combined_credits?.crew?.[0]?.job)
                ? 'Другие работы'
                : ''

            keyboard = keyboardPerson(
                Number(mediaId),
                firstJob,
                secondJob
            )
        }

        if (!image) {
            throw new Error(`Image not found for media ${mediaId}`)
        }

        await ctx.telegram.editMessageMedia(
            undefined,
            undefined,
            inlineMessageId,
            {
                type: 'photo',
                media:
                    `https://image.tmdb.org/t/p/original${image}`,
                caption,
                parse_mode: 'HTML'
            },
            {
                reply_markup:
                keyboard
            }
        )


    } catch (error: any) {

        console.error('[CHOSEN INLINE CARD ERROR]', error)

        try {

            await ctx.telegram.editMessageText(
                undefined,
                undefined,
                inlineMessageId,

                '⚠️ Не удалось загрузить карточку.\n\nПопробуйте найти фильм ещё раз.',

                {
                    parse_mode: 'HTML',
                    reply_markup:
                    Markup.inlineKeyboard([[
                        SearchButtonBot(
                            'Искать другое',
                            'inline'
                        )
                    ]
                    ]).reply_markup
                }
            )

        } catch (editError: any) {

            const description = editError?.response?.description || ''

            if (description.includes('message is not modified')) {
                return
            }

            console.error('[CHOSEN INLINE CARD FALLBACK ERROR]', editError)
        }
    }
}

import {isAdmin} from "#server/bot/consts/admins";
import {getKeyTrailer} from "#server/bot/consts/media/getKeyTrailer";
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardPerson, keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {createPersonCaption} from "~/utils/person/createPersonCaption";
import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";
import {getPersonApi, searchPerson} from "#server/global/engine/search/repository/tmdbRepository";
import {tmdbFetch} from "#server/utils/api/tmdbFetch";

export const chosenInlineCard = async (ctx: any) => {

    try {

        const result = ctx.update.chosen_inline_result
        const inlineMessageId = result?.inline_message_id

        if (!inlineMessageId) return
        if (result.result_id === 'no_search_results' || result.result_id === 'empty_collection') return

        const [_, mediaType, contentType, mediaId
        ] = result.result_id.split('_')

        const isPerson = mediaType === 'person' || contentType === 'person'

        let media
        let keyTrailer
        let keyboard
        let caption
        let image
        const admin = isAdmin(result.from.id)

        if (!isPerson) {
            media = await tmdbFetch(
                '/api/bot/getMediaBot',
                {
                    query: {
                        media: mediaType,
                        id: mediaId
                    }
                }
            )

            const trailers = await tmdbFetch(
                '/api/tmdb/trailers',
                {
                    query: {
                        media: mediaType,
                        id: mediaId
                    }
                }
            )
            keyTrailer = getKeyTrailer(trailers)

            image = media.backdrop_path || media.poster_path

            caption = createMediaCaption(
                media,
                contentType,
                undefined,
                undefined,
                keyTrailer
            )

            keyboard = keyboardSendMediaCardInline(
                mediaId,
                mediaType,
                contentType,
                media.genres,
                admin,
                'inline',
                0,
                keyTrailer
            )

        } else {
            const crewData = await tmdbFetch(
                "/api/tmdb/credits",
                {
                    query: {
                        id: mediaId,
                        personJob: "crew"
                    }
                }
            )

            const getSecondJob = crewData.results?.[0]?.job || ''
            console.log('getS', getSecondJob)
            console.log('getCrew', crewData.results[0])

            const media = await getPersonApi(mediaId)

            image = media.profile_path
            caption = createPersonCaption(media)

            const personId = media.id
            const firstJob = convertTranslateKnowForDepartment(media.known_for_department)
            const secondJob = convertTranslateKnowForDepartment(getSecondJob)

            keyboard = keyboardPerson(
                personId,
                firstJob,
                secondJob)

        }

        await ctx.telegram.editMessageMedia(undefined, undefined, inlineMessageId,
            {
                type: 'photo',
                media: `https://image.tmdb.org/t/p/original${image}`,
                caption,
                parse_mode: 'HTML'
            },
            {
                reply_markup:
                    keyboard
            }
        )

    } catch (e) {

        console.log(
            'chosenInlineCard error:',
            e
        )

    }

}

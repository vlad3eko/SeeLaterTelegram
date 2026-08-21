import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";
import {contentTypeConvert} from "~/utils/convert/contentTypeConvert";
import {FormatDate, FormatRating} from "~/utils/formatMoviesData";
import {genresConvert} from "~/utils/convert/genresConvert";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const searchType = (medias: any) => {

    const results = medias.results.map((media: any) => {

        // Определяем тип результата
        const isPerson =
            media.media_type === 'person' ||
            media.content_type === 'person'

        // Заголовок
        const title =
            media.title ||
            media.name ||
            'Без названия'

        // Постер / аватар
        const imagePath =
            media.poster_path ||
            media.profile_path

        const thumb_url = imagePath
            ? `https://image.tmdb.org/t/p/w500${imagePath}`
            : 'https://www.levyinstitute.org/wp-content/themes/levy_institute_v2/img/no_profile_image.gif'

        let description = ''

        if (isPerson) {

            const dept = convertTranslateKnowForDepartment(
                media.known_for_department
            )

            description = `👤 ${dept}`

            if (
                Array.isArray(media.known_for) &&
                media.known_for.length > 0
            ) {

                const works = media.known_for
                    .map((work: any) => work.title || work.name)
                    .filter(Boolean)
                    .join(', ')

                if (works) {
                    description += ` | Популярность за:\n${works}`
                }
            }

        } else {

            const typeLabel = contentTypeConvert(
                media.media_type,
                media.content_type
            )

            const rating = media.vote_average
                ? `💎 ${FormatRating(media.vote_average)} | `
                : ''

            const votes = media.vote_count
                ? `🍿 ${media.vote_count} | `
                : ''

            const releaseDate =
                media.release_date ||
                media.first_air_date

            const date = releaseDate
                ? `${FormatDate(releaseDate)} | `
                : ''

            const genres = media.genres
                ? genresConvert(media.genres)
                : ''

            description =
                `${typeLabel} | ${rating}${votes}\n` +
                `${date}${genres}`
        }

        return {
            type: 'article',

            // ID должен быть уникальным для конкретной страницы/медиа
            id: `${medias.page}_${media.media_type}_${media.content_type}_${media.id}`,

            title,

            description: description.trim(),

            thumb_url,

            input_message_content: {
                message_text: 'bot: ⏳ Загружаю карточку...'
            },

            reply_markup: keyboardSendMediaCardInline(
                media.id,
                media.media_type || media.content_type,
                media.content_type || media.media_type
            )
        }
    })

    return {
        // Именно массив результатов Telegram
        results,

        // Пагинация сохраняется отдельно
        page: medias.page,
        total_pages: medias.total_pages,

        // Сохраняем существующие настройки, если они есть
        inlineOptions: medias.inlineOptions || {}
    }
}

import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";
import {contentTypeConvert} from "~/utils/convert/contentTypeConvert";
import {FormatDate, FormatRating} from "~/utils/formatMoviesData";
import {genresConvert} from "~/utils/convert/genresConvert";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const searchType = (medias: any) => {
    return medias.results.map((media: any) => {
        // 1. Определяем, человек это или медиа (фильм/сериал)
        const isPerson = media.media_type === 'person' || media.content_type === 'person'

        // 2. Универсальный заголовок
        const title = media.title || media.name || 'Без названия'

        // 3. Универсальная аватарка/постер
        const imagePath = media.poster_path || media.profile_path
        const thumb_url = imagePath ? `https://image.tmdb.org/t/p/w500${imagePath}` : `https://www.levyinstitute.org/wp-content/themes/levy_institute_v2/img/no_profile_image.gif`

        // 4. Сборка описания (деревянная проверка на существование полей)
        let description = ''

        if (isPerson) {
            // Если человек
            const dept = convertTranslateKnowForDepartment(media.known_for_department)
            description = `👤 ${dept}`

            // Если есть известные работы, добавим их строкой
            if (media.known_for && media.known_for.length > 0) {
                const works = media.known_for
                    .map((w: any) => w.title || w.name)
                    .filter(Boolean)
                    .join(', ')
                if (works) description += ` | Популярность за: \n${works}`
            }
        } else {
            // Если фильм / сериал / медиа
            const typeLabel = contentTypeConvert(media.media_type, media.content_type)
            const rating = media.vote_average ? `💎 ${FormatRating(media.vote_average)} | ` : ''
            const votes = media.vote_count ? `🍿 ${media.vote_count} | ` : ''
            const date = media.release_date || media.first_air_date ? `${FormatDate(media.release_date || media.first_air_date)} | ` : ''
            const genres = media.genres ? genresConvert(media.genres) : ''

            description = `${typeLabel} | ${rating}${votes}\n${date}${genres}`
        }

        // 5. Возвращаем объект для Telegram
        return {
            type: 'article',
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
}

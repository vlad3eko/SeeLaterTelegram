
import {Markup} from "telegraf";
import {LoadingButtonTelegramCard} from "#server/bot/consts/buttons/buttonsBot";
import {createMediaCaption} from "#server/global/engine/card/variant/createMediaCaption";
import {createPersonCaption} from "#server/global/engine/card/variant/createPersonCaption";

export const processExecuteCard = (medias: any) => {

    const results = medias.results.map((media: any) => {

        const isPerson = media.media_type === 'person' || media.content_type === 'person'
        const imagePath = media.poster_path || media.profile_path

        const thumb_url =
            imagePath
                ? `https://image.tmdb.org/t/p/w500${imagePath}`
                : 'https://www.levyinstitute.org/wp-content/themes/levy_institute_v2/img/no_profile_image.gif'


        const richMessage = isPerson
            ? createPersonCaption("pending", {media, contentType: media.content_type})
            : createMediaCaption('pending', {media, contentType: media.content_type})

        return {
            type: 'article',
            id: `${medias.page}_${media.media_type}_${media.content_type}_${media.id}`,
            title: media.title || media.name || 'Без названия',
            thumbnail_url: thumb_url,
            input_message_content: {rich_message: richMessage},
            reply_markup: Markup.inlineKeyboard([LoadingButtonTelegramCard()]).reply_markup
        }
    })

    return {
        results,
        page: medias.page,
        total_pages: medias.total_pages,
        inlineOptions: medias.inlineOptions || {}
    }
}

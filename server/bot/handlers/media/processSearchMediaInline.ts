import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";
import {FormatDate} from "~/utils/formatMoviesData";

export const processSearchMediaInline = async (ctx: any, medias: any) => {

    try {
        // Из этого варианта мне нужно чтобы был красивый пост после выбора из результатов поиска
        const results = medias.results.map((media: any) => ({
            type: 'photo',

            id: String(media.id),

            photo_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,
            thumbnail_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,

            title: media.title || media.name, // не отображается

            description: `${media.media_type} | imdb 7.9 | (${FormatDate(media.release_date || media.first_air_date) || '❌ отсутствует'})`, // не отображается

            caption: createMediaCaption(media, media.media_type), // в посте есть картинка
            parse_mode: 'HTML',
            reply_markup: keyboardSendMediaCardInline(media.id, media.media_type)
        }))

        console.log('result', results[0])
        await ctx.answerInlineQuery(results)
    } catch (e) {
        console.log('Ошибка: ', e)
        await ctx.answerInlineQuery([])
    }
}

// Из этого варианта мне нужно чтобы был красивые поиск с вертикальными блоками картика+описание
// const results = medias.results.map((media: any) => ({
//     type: 'article',
//
//     id: String(media.id),
//
//     photo_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,
//     thumbnail_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,
//
//     title: media.title || media.name, // отображается
//
//     description: `${media.media_type} | imdb 7.9 | (${FormatDate(media.release_date || media.first_air_date) || '❌ отсутствует'})`, // отображается
//
//     message_text: createMediaCaption(media, media.media_type), // в посте нет картинки
//     parse_mode: 'HTML',
//     reply_markup: keyboardSendMediaCardInline(media.id, media.media_type)
// }))

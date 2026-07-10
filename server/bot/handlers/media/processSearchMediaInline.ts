import {FormatDate} from "~/utils/formatMoviesData";

export const processSearchMediaInline = async (ctx: any, medias: any) => {

    try {
        const results = medias.results.map((media:any)=>({
            type: 'article',
            id: `${media.media_type}_${media.id}`,

            title:  media.title || media.name,
            description: `${media.media_type} | imdb 7.9 | (${FormatDate(media.release_date || media.first_air_date) || '❌ отсутствует'})`,
            thumb_url: `https://image.tmdb.org/t/p/w500${media.poster_path}`,

            message_text: 'bot: загрузка карточки...',
            parse_mode: 'HTML'
        }))

        await ctx.answerInlineQuery(
            results, {cache_time:0})

    } catch(e) {
        console.log('Ошибка inline:', e)
        await ctx.answerInlineQuery([])
    }
}

/*
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
*/

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

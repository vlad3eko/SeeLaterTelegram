import {clearAdminEditSession, getAdminEditSession} from "#server/bot/actions/admin/adminEditSession"
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot"
import {CURRENT_KEYBOARD_VERSION} from "#server/bot/consts/keyboardVersion/keyboardVersion"
import {createMediaCaption} from "#server/bot/consts/media/createMediaCaption"
import {tmdbFetch} from "#server/utils/api/tmdbFetch"

export const publishAdminInlineMedia = async (ctx: any) => {

    const [
        ,
        mediaId,
        mediaType,
        contentType,
        keyTrailer
    ] = ctx.match

    const media =
        await tmdbFetch(
            '/api/bot/getMediaBot',
            {
                query: {
                    id: mediaId,
                    media: mediaType
                }
            }
        )

    let session =
        getAdminEditSession(ctx.from.id) ??
        {
            inlineMessageId:
            ctx.callbackQuery.inline_message_id,
            mediaId:
                Number(mediaId),
            mediaType,
            media,
            contentType,
            keyTrailer,
            currentMedia: {
                type: 'photo',
                fileId:
                    `https://image.tmdb.org/t/p/w500${
                        media.poster_path ||
                        media.backdrop_path
                    }`
            },
            currentCaption:
                createMediaCaption(
                    media,
                    contentType,
                    undefined,
                    undefined,
                    keyTrailer
                )
        }

    const channelId =
        '@kinomanovnet'

    const {
        type,
        fileId
    } =
        session.currentMedia

    const channelReplyMarkup =
        keyboardSendMediaCardInline(
            session.mediaId,
            session.mediaType,
            session.contentType,
            session.media.genres,
            false,
            'channel'
        )

    let publishedMessage

    if (type === 'photo') {

        publishedMessage =
            await ctx.telegram.sendPhoto(
                channelId,
                fileId,
                {
                    caption:
                    session.currentCaption,

                    parse_mode:
                        'HTML',

                    reply_markup:
                    channelReplyMarkup
                }
            )
    }

    if (type === 'video') {

        publishedMessage =
            await ctx.telegram.sendVideo(
                channelId,
                fileId,
                {
                    caption:
                    session.currentCaption,

                    parse_mode:
                        'HTML',

                    reply_markup:
                    channelReplyMarkup
                }
            )
    }

    if (!publishedMessage) {

        await ctx.answerCbQuery(
            'Не удалось опубликовать'
        )

        return
    }

    try {

        await $fetch(
            '/api/bot/publishedMedia/create',
            {
                method: 'POST',

                body: {

                    telegramChatId:
                    channelId,

                    telegramMessageId:
                    publishedMessage.message_id,

                    mediaId:
                    session.mediaId,

                    mediaType:
                    session.mediaType,

                    contentType:
                    session.contentType,

                    keyboardVersion:
                    CURRENT_KEYBOARD_VERSION
                }
            }
        )

    } catch (error) {

        console.error(
            '[PUBLISHED MEDIA SAVE ERROR]',
            error
        )

        await ctx.answerCbQuery(
            'Карточка опубликована, но не сохранена в истории'
        )

        return
    }

    try {

        await $fetch(
            '/api/bot/publishedMedia/syncKeyboards',
            {
                method: 'POST'
            }
        )

    } catch (error) {

        console.error(
            '[KEYBOARD SYNC ERROR]',
            error
        )
    }

    if (session.inlineMessageId) {

        await ctx.telegram.editMessageReplyMarkup(
            undefined,
            undefined,
            session.inlineMessageId,
            {
                reply_markup:
                    keyboardSendMediaCardInline(
                        session.mediaId,
                        session.mediaType,
                        session.contentType,
                        session.media.genres,
                        false,
                        'inline'
                    )
            }
        )
    }

    clearAdminEditSession(
        ctx.from.id
    )

    await ctx.answerCbQuery(
        'Опубликовано'
    )
}

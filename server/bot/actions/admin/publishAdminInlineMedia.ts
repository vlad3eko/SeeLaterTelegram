import {clearAdminEditSession, getAdminEditSession} from "#server/bot/actions/admin/adminEditSession";
import {keyboardSendMediaCardInline} from "#server/bot/consts/buttons/keyboardBot";

export const publishAdminInlineMedia = async (ctx: any) => {

    const session =
        getAdminEditSession(ctx.from.id)


    if (!session) {
        await ctx.answerCbQuery(
            'Сессия редактирования не найдена'
        )

        return
    }

    const channelId =
        '@kinomanovnet'

    const {
        type,
        fileId
    } = session.currentMedia

    const replyMarkup =
        keyboardSendMediaCardInline(
            session.mediaId,
            session.mediaType,
            session.contentType,
            session.media.genres,
            false
        )

    if (type === 'photo') {

        await ctx.telegram.sendPhoto(
            channelId,
            fileId,
            {
                caption: session.currentCaption,
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            }
        )
    }

    if (type === 'video') {

        await ctx.telegram.sendVideo(
            channelId,
            fileId,
            {
                caption: session.currentCaption,
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            }
        )
    }

    // После успешной публикации
    // убираем только админские кнопки

    await ctx.telegram.editMessageReplyMarkup(
        undefined,
        undefined,
        session.inlineMessageId,

        {
            reply_markup: replyMarkup
        }
    )
    clearAdminEditSession(ctx.from.id)

    await ctx.answerCbQuery(
        'Опубликовано'
    )
}

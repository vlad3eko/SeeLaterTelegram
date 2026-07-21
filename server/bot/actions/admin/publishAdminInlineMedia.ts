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

    if (type === 'photo') {

        await ctx.telegram.sendPhoto(
            channelId,
            fileId,
            {
                caption: session.currentCaption,
                parse_mode: 'HTML'
            }
        )
    }

    if (type === 'video') {

        await ctx.telegram.sendVideo(
            channelId,
            fileId,
            {
                caption: session.currentCaption,
                parse_mode: 'HTML'
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
            reply_markup:
                keyboardSendMediaCardInline(
                    session.mediaId,
                    session.mediaType,
                    session.contentType,
                    session.media.genres,
                    false
                )
        }
    )
    clearAdminEditSession(ctx.from.id)

    await ctx.answerCbQuery(
        'Опубликовано'
    )
}

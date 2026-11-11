import {ADMIN_VIDEO_TYPE} from "#server/bot/callbacks/routes"
import {getAdminEditSession, updateAdminEditSession} from "#server/bot/actions/admin/adminEditSession"
import {adminVideoTypeKeyboard} from "#server/bot/consts/buttons/admin/buttonsAdmin"

const answer = async (ctx: any, text: string) => {
    try {
        await ctx.answerCbQuery(text)
    } catch {
        // Callback мог устареть: ответ необязателен.
    }
}

/**
 * «🎞 Трейлер» / «✂️ Нарезка» под сообщением «ключ сохранён». Тип запоминается в сессии
 * редактирования и уходит в задачу при «Опубликовать» (выбор после публикации на уже
 * запущенную задачу не влияет).
 */
export const adminChooseVideoType = async (ctx: any) => {
    const {videoType} = ADMIN_VIDEO_TYPE.parse(ctx)
    const session = await getAdminEditSession(ctx.from.id)

    if (!session?.keyTrailer || session.trailerKeySource !== 'manual') {
        await answer(ctx, 'Сначала пришли ссылку через «Изменить ключ трейлера»')
        try {
            await ctx.editMessageReplyMarkup(undefined)
        } catch {
            // Уже без кнопок.
        }
        return
    }

    if (session.mode === 'publish') {
        return answer(ctx, 'Публикация уже идёт: тип для неё не меняется')
    }

    await updateAdminEditSession(ctx.from.id, {videoType})
    await answer(ctx, videoType === 'clip' ? 'Тип: нарезка' : 'Тип: трейлер')

    try {
        await ctx.editMessageReplyMarkup(adminVideoTypeKeyboard(videoType))
    } catch (error: any) {
        if (error?.response?.description !== 'Bad Request: message is not modified') {
            console.warn('[ADMIN VIDEO TYPE KEYBOARD UPDATE ERROR]', error?.response?.description || error?.message || error)
        }
    }
}

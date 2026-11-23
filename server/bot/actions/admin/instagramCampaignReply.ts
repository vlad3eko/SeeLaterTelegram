import {getSupabase} from '#server/global/engine/instagram/reel/jobs/dispatchReelJob'
import {linkCampaignByReply} from '#server/global/engine/instagram/comments/campaigns'
import {isMissingTable} from '#server/global/engine/collections/trailers'

/**
 * Администратор ответил (reply) на вопрос бота о новом Reel названием, ссылкой или номером TMDB — Reel
 * привязывается к этому фильму, «СОХРАНИТЬ» включается (так привязываются Reels, собранные мимо бота, и
 * исправляется неверно угаданный фильм). Вопрос в чате заменяется итогом. false — сообщение не про кампанию.
 */
export const handleCampaignReply = async (ctx: any): Promise<boolean> => {
    const text = ctx.message?.text
    const repliedTo = ctx.message?.reply_to_message?.message_id
    if (!text || !repliedTo || text.startsWith('/')) return false
    try {
        const result = await linkCampaignByReply(getSupabase(), Number(repliedTo), text)
        if (!result) return false
        if (result.questionText) {
            await ctx.telegram.editMessageText(ctx.chat.id, repliedTo, undefined, result.questionText, {
                link_preview_options: {is_disabled: true}
            }).catch(() => undefined)
        }
        await ctx.reply(result.reply, {reply_parameters: {message_id: ctx.message.message_id}, link_preview_options: {is_disabled: true}})
        return true
    } catch (error: any) {
        if (isMissingTable(error)) return false
        console.error('[IG CAMPAIGN] привязка ответом не удалась', error?.message ?? error)
        await ctx.reply('Не получилось привязать Reel — попробуйте ещё раз или пришлите ссылку TMDB.').catch(() => undefined)
        return true
    }
}

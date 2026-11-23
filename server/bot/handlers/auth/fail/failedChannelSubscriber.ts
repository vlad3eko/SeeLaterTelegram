
import {Markup} from "telegraf";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {checkSubscriptionButtonBot} from "#server/bot/consts/buttons/buttonsBot";
import {channelLines, missingChannels} from "#server/bot/handlers/channel/requiredChannels";
import type {RequiredChannel} from "#server/global/oneLinkApp";

/** Кнопки «Подписаться» — по одной на каждый канал, на который ещё нет подписки. */
export const subscribeButtons = (missing: readonly RequiredChannel[]) =>
    missing.map(channel => [Markup.button.url(`Подписаться: ${channel.title}`, channel.url)])

export const subscribeRequestText = (missing: readonly RequiredChannel[]) =>
    `❌ Чтобы пользоваться ботом, подпишитесь на наши каналы:\n\n${channelLines(missing)}\n\n` +
    'Это не реклама — это официальные каналы бота. Как только подпишетесь, бот сам это увидит и продолжит.'

export const failedChannelSubscriber = async (ctx: any) => {

    const missing = await missingChannels(ctx.telegram, ctx.from.id)

    const message = await ctx.reply(
        subscribeRequestText(missing),
        Markup.inlineKeyboard([
            ...subscribeButtons(missing),
            [checkSubscriptionButtonBot()]
        ])
    )

    await addMessageSession(
        ctx.from.id,
        SessionMessageType.Error, {
            messageId: message.message_id
        }
    )
}

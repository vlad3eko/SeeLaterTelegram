
import {isSubscribedToAll} from "#server/bot/handlers/channel/requiredChannels";

/** Подписка на все обязательные каналы (REQUIRED_CHANNELS в oneLinkApp.ts). */
export const checkChannelSubscriber = async (ctx: any) =>
    isSubscribedToAll(ctx.telegram, ctx.from.id)

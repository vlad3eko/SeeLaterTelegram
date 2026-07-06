import {Telegraf} from "telegraf";
import {selectMedia} from "#server/bot/actions/media/selectMedia";
import {saveMedia} from "#server/bot/actions/media/saveMedia";
import {deleteMedia} from "#server/bot/actions/media/deleteMedia";
import {searchMedia} from "#server/bot/actions/media/searchMedia";

export function registerMediaActions(bot: Telegraf) {
    bot.action(/^search_media(?::(\w+))?$/, async (ctx) => {
        const mode = ctx.match[1] ?? 'default'
        await searchMedia(ctx, {mode})
    })

    bot.action(/^media_(\d+)_(movie|tv)$/, selectMedia)
    bot.action(/^save_media_(\d+)_(\d+)_(movie|tv)$/, saveMedia)
    bot.action(/^delete_media_(\d+)$/, deleteMedia)
}

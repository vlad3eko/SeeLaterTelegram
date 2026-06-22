import { Telegraf } from 'telegraf'
import {start} from "#server/bot/commands/start";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";
import {processMediaSearch} from "#server/bot/services/addMedia/processMediaSearch";
import {addMediaState} from "#server/bot/consts/addMedia/addMediaState";
import {addMovie} from "#server/bot/actions/addMedia";
import {selectMedia} from "#server/bot/actions/addMedia/selectMedia";
import {saveMedia} from "#server/bot/actions/addMedia/saveMedia";

let bot: Telegraf | null = null

export const getBot = () => {

    if (bot) return bot

    const config = useRuntimeConfig()

    bot = new Telegraf(config.telegramKey)

    const authRequests = new Map()

    bot.start(async (ctx) => {
        await start(ctx, authRequests)
    })

    bot.action('check_sub', async (ctx) =>
        await processTelegramAuth(ctx, authRequests)
    )

    bot.action('add_media', async (ctx) =>
        await processMediaSearch(ctx, bot, authRequests)
    )

    bot.on('text', async (ctx) => {

        const state = addMediaState.get(ctx.from.id)

        if (!state?.waitingMovie) {
            return
        }

        await addMovie(ctx)
    })

    bot.action(/^media_(\d+)_(movie|tv)$/, selectMedia)

    bot.action(/^save_(\d+)_(\d+)_(movie|tv)$/, saveMedia)

    return bot
}

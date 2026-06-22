import {Telegraf} from 'telegraf'
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
        try {
            await start(ctx, authRequests)
        } catch (e) {
            console.error('ACTION ERROR start:', e)
        }
    })

    bot.action('check_sub', async (ctx) => {
            try {
                await processTelegramAuth(ctx, authRequests)
            } catch (e) {
                console.error('ACTION ERROR processTelegramAuth:', e)
            }
        }
    )

    bot.action('add_media', async (ctx) => {
            try {
                await processMediaSearch(ctx, bot, authRequests)
            } catch (e) {
                console.error('ACTION ERROR processMediaSearch:', e)
            }
        }
    )

    bot.on('text', async (ctx) => {

        try {
            const state = addMediaState.get(ctx.from?.id)
            if (!state?.waitingMovie) return

            await addMovie(ctx)

        } catch (e) {
            console.error('TEXT ERROR on:', e)
        }
    })

    bot.action(/^media_(\d+)_(movie|tv)$/, async (ctx) => {
        try {
            await selectMedia(ctx)
        } catch (e) {
            console.error('TEXT ERROR selectMedia:', e)
        }
    })

    bot.action(/^media_(\d+)_(movie|tv)$/, async (ctx) => {
        try {
            await saveMedia(ctx)
        } catch (e) {
            console.error('TEXT ERROR saveMedia:', e)
        }
    })

    return bot
}

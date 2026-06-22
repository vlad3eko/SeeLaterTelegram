import { Telegraf } from 'telegraf'
import {start} from "#server/bot/commands/start";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";
import {processMediaSearch} from "#server/bot/services/addMedia/processMediaSearch";
import {addMediaState} from "#server/bot/consts/addMedia/addMediaState";
import {addMovie} from "#server/bot/actions/addMedia";
import {selectMedia} from "#server/bot/actions/addMedia/selectMedia";
import {saveMedia} from "#server/bot/actions/addMedia/saveMedia";

let index: Telegraf | null = null

export const getBot = () => {

    if (index) return index

    const config = useRuntimeConfig()

    index = new Telegraf(config.telegramKey)

    const authRequests = new Map()

    index.start(async (ctx) => {
        await start(ctx, authRequests)
    })

    index.action('check_sub', async (ctx) =>
        await processTelegramAuth(ctx, authRequests)
    )

    index.action('add_media', async (ctx) =>
        await processMediaSearch(ctx, index, authRequests)
    )

    index.on('text', async (ctx) => {

        const state = addMediaState.get(ctx.from.id)

        if (!state?.waitingMovie) {
            return
        }

        await addMovie(ctx)
    })

    index.action(/^media_(\d+)_(movie|tv)$/, selectMedia)

    index.action(/^save_(\d+)_(\d+)_(movie|tv)$/, saveMedia)


    return index
}

import {Telegraf} from 'telegraf'
import {start} from "#server/bot/commands/start";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";

export default defineNitroPlugin(() => {

    const config = useRuntimeConfig()

    const bot = new Telegraf(config.telegramKey)

    const authRequests = new Map()

    bot.start(async (ctx) => {
        await start(ctx, authRequests)
    })

    bot.action('check_sub',
        async (ctx) =>
            await processTelegramAuth(ctx, authRequests)
    )

    bot.launch()

    console.log('Telegram bot started')
})

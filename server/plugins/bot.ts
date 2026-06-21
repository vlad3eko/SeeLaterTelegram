import { Telegraf } from 'telegraf'
import { start } from "#server/bot/commands/start"
import { processTelegramAuth } from "#server/bot/services/auth/processTelegramAuth"
import { processMovieSearch } from "#server/bot/services/addMedia/processMovieSearch"
import { selectMedia } from "#server/bot/actions/addMedia/selectMedia"
import { saveMedia } from "#server/bot/actions/addMedia/saveMedia"

const globalForBot = globalThis as any

export default defineNitroPlugin(() => {

    if (globalForBot.telegramBot) return

    const config = useRuntimeConfig()

    const bot = new Telegraf(config.telegramKey)

    const authRequests = new Map()

    bot.start(async (ctx) => {
        await start(ctx, authRequests)
    })

    bot.action('check_sub', async (ctx) =>
        await processTelegramAuth(ctx, authRequests)
    )

    bot.action('add_media', async (ctx) =>
        await processMovieSearch(ctx, bot)
    )

    bot.action(/^media_(\d+)_(movie|tv)$/, selectMedia)

    bot.action(/^save_(\d+)_(movie|tv)$/, saveMedia)

    // 💡 ВАЖНО: webhook ставим ТОЛЬКО один раз
    bot.telegram.setWebhook(
        'https://see-later-telegram.vercel.app/api/bot/webhook'
    )

    globalForBot.telegramBot = bot

    console.log('Telegram bot initialized')
})

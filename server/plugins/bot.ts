import {Telegraf} from 'telegraf'
import {start} from "#server/bot/commands/start";
import {processTelegramAuth} from "#server/bot/services/auth/processTelegramAuth";

export default defineNitroPlugin( () => {

    const config = useRuntimeConfig()

    const bot = new Telegraf(config.telegramKey)

    bot.start(start)

    bot.action('check_sub', processTelegramAuth)
    bot.command('add', async (ctx) => {

        await ctx.reply(
            `Чтобы добавить фильм, напишите только название. 
            \nПример: 
            \nВластелины вселенной`
        )

    })

    bot.launch()

    console.log('Telegram bot started')
})

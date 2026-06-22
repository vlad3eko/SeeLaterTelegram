import { Telegraf } from 'telegraf'
import { start } from "#server/bot/commands/start"
import { processTelegramAuth } from "#server/bot/services/auth/processTelegramAuth"
import { processMediaSearch } from "#server/bot/services/addMedia/processMediaSearch"
import { selectMedia } from "#server/bot/actions/addMedia/selectMedia"
import { saveMedia } from "#server/bot/actions/addMedia/saveMedia"
import {addMovie} from "#server/bot/actions/addMedia";
import {addMediaState} from "#server/bot/consts/addMedia/addMediaState";
import {getBot} from "#server/bot";

const globalForBot = globalThis as any

export default defineNitroPlugin(async () => {

    if (globalForBot.telegramBot) return

    const config = useRuntimeConfig()

    const bot = getBot()


    globalForBot.telegramBot = bot

    console.log('Telegram bot initialized')
})

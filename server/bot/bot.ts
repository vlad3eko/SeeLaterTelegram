import { Telegraf } from 'telegraf'

import { start } from '#server/bot/commands/start'
import { processTelegramAuth } from '#server/bot/services/auth/processTelegramAuth'
import { processMediaSearch } from '#server/bot/services/addMedia/processMediaSearch'
import { saveMedia } from '#server/bot/actions/addMedia/saveMedia'
import {nameMediaSearch} from '#server/bot/actions/addMedia/nameMediaSearch'
import { addMediaState } from '#server/bot/consts/addMedia/addMediaState'
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {selectMedia} from "#server/bot/actions/addMedia/selectMedia";

export const bot = new Telegraf(process.env.TELEGRAM_TOKEN!)
const authRequests = new Map()

// --- commands ---
bot.start(async (ctx) => {
    await start(ctx, authRequests)
})

// --- actions ---
bot.action('menu_bot', menuBot)

bot.action('check_sub', async (ctx) => {
    await processTelegramAuth(ctx, authRequests)
})

bot.action('add_media', async (ctx) => {
    await processMediaSearch(ctx)
})

bot.action(/^media_(\d+)_(movie|tv)$/, selectMedia)

bot.action(/^save_(\d+)_(\d+)_(movie|tv)$/, async (ctx) => await saveMedia(ctx, authRequests))

bot.action(/^back_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery()
    await ctx.deleteMessage()
})

// --- text handler ---
bot.on('text', async (ctx) => {

    const state = addMediaState.get(ctx.from.id)

    if (!state?.waitingMovie) return

    await nameMediaSearch(ctx)
})

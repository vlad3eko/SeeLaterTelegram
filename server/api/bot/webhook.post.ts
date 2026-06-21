import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {

    const bot = (globalThis as any).telegramBot

    if (!bot) {
        return { ok: false, error: 'Bot not initialized' }
    }

    const update = await readBody(event)

    await bot.handleUpdate(update)

    return { ok: true }
})

import {bot} from "#server/bot/bot";

export default defineEventHandler(async (event) => {
    console.log('🔥 WEBHOOK HIT')
    const body = await readBody(event)
    try {
        await bot.handleUpdate(body)
        console.log('BODY:', body)
        return { ok: true }
    } catch (err: any) {
        console.error('Telegram webhook error:', err)
        return { ok: false }
    }
})

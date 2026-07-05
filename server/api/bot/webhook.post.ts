import {bot} from "#server/bot/bot";

export default defineEventHandler(async (event) => {
    const body = await readBody(event)

    try {
        console.log('bot', bot)
        return { ok: true }
    } catch (err: any) {
        console.error('Telegram webhook error:', err)
        return { ok: false }
    }
})

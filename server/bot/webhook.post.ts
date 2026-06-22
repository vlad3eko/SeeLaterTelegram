import {getBot} from "#server/plugins/bot";

export default defineEventHandler(async (event) => {

    const bot = getBot()
    const body = await readBody(event)

    try {
        await bot.handleUpdate(body)
    } catch (e) {
        console.error('Webhook error:', e)
        return {ok: false}
    }
    return {ok: true}

})

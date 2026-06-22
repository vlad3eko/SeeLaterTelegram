// import {Telegraf} from 'telegraf'
// import {getBot} from "#server/bot/index";
//
//
// export default defineEventHandler(async (event) => {
//
//     try {
//
//         const bot = getBot()
//
//         const body = await readBody(event)
//
//         await bot.handleUpdate(body)
//
//         return {ok: true}
//
//     } catch (e) {
//
//         console.error('Webhook error:', e)
//
//         return {ok: false}
//     }
// })

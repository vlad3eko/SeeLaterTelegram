// npm run dev: бот работает через polling (server/bot/bot.ts), но Nitro подгружает обработчики
// лениво, и без этого плагина бот стартовал только после первого запроса к серверу.
// В production (Vercel) плагин ничего не делает: бот получает обновления через webhook.
export default defineNitroPlugin(async () => {
    if (process.env.NODE_ENV !== 'development') return

    await import('#server/bot/bot')
})

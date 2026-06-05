import { Markup, Telegraf } from 'telegraf'

export default defineNitroPlugin(() => {

    const config = useRuntimeConfig()

    const bot = new Telegraf(config.telegramKey)

    const authRequests = new Map()

    bot.start(async (ctx) => {

        const token = ctx.payload
        authRequests.set(ctx.from.id, token)

        await ctx.reply(
            'Привет! \n\nПодпишитесь на канал.',
            Markup.inlineKeyboard([
                Markup.button.url(
                    'Подписаться',
                    'https://t.me/Zerno_Kopeica'
                ),
                Markup.button.callback(
                    'Проверить подписку',
                    'check_sub'
                )
            ])
        )
    })

    bot.action('check_sub', async (ctx) => {

        try {

            const member = await ctx.telegram.getChatMember(
                '@Zerno_Kopeica',
                ctx.from.id
            )

            const isSubscribed = [
                'member',
                'administrator',
                'creator'
            ].includes(member.status)

            if (!isSubscribed) {

                await ctx.reply(
                    '❌ Вы не подписаны на канал',
                    Markup.inlineKeyboard([
                        Markup.button.url(
                            'Подписаться',
                            'https://t.me/Zerno_Kopeica'
                        )
                    ])
                )

                return
            }

            const authToken = authRequests.get(ctx.from.id)

            await $fetch('/api/auth/telegram', {
                method: 'POST',
                body: {
                    telegram_id: ctx.from.id,
                    username: ctx.from.username,
                    first_name: ctx.from.first_name,
                }
            })

            await $fetch('/api/auth/telegram-confirm', {
                method: 'POST',
                body: {
                    token: authToken,
                    telegram_id: ctx.from.id,
                }
            })

            await ctx.reply(`id: ${ctx.from.id} \n username: ${ctx.from.username} \n name: ${ctx.from.first_name}`)


            await ctx.reply(
                '✅ Подписка подтверждена \n Спасибо за поддержку проекта! \n Разработчик: vlad3eko'
            )
        } catch (error) {

            console.error(error)

            await ctx.reply(
                `Ошибка проверки подписки ${error}`
            )
        }
    })

    bot.launch()

    console.log('Telegram bot started')
})

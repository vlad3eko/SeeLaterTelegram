
import {useUserStore} from "~/stores/user.store";
import type {TelegramResponse} from "~/types/auth/telegram/telegram.types";
import {telegramBotShortLink} from "#server/global/oneLinkApp";

export const useAuthStore = defineStore('isAuth', () => {

    const user = useUserStore()
    const pendingAuth = ref<boolean>(false)

    const login = async () => {

        const token = crypto.randomUUID()

        window.open(
            `${telegramBotShortLink}?start=${token}`,
            '_blank'
        )

        // Запрос входа создаёт сервер: браузер напрямую в базу не пишет.
        try {
            await $fetch('/api/auth/telegram-request', {
                method: 'POST',
                body: {token}
            })
        } catch (err) {
            console.error('Auth request error:', err)
            return
        }

        pendingAuth.value = true

        const MAX_ATTEMPTS = 10
        let attempts = 0

        const interval = setInterval(async () => {
            try {

                // ⛔ Останавливаем после 10 попыток
                if (++attempts >= MAX_ATTEMPTS) {
                    clearInterval(interval)
                    pendingAuth.value = false
                    return
                }

                const data: TelegramResponse = await $fetch(
                    '/api/auth/telegram-verify',
                    {
                        query: { token }
                    }
                )

                if (data?.data?.confirmed) {

                    // Опрос останавливаем сразу: токен одноразовый, повторный вход по нему не пройдёт.
                    clearInterval(interval)
                    pendingAuth.value = false

                    await $fetch('/api/auth/telegram-login', {
                        method: 'POST',
                        body: {token}
                    })

                    await user.refresh()
                }

            } catch (err) {
                console.error('Auth polling error:', err)
            }
        }, 1000)
    }

    const logout = async () => {
        try {
            await $fetch('/api/auth/telegram-logout', {
                method: 'POST',
            })
        } catch (err) {
            throw new Error('logout Failed.')
        } finally {
            user.clear()
        }
    }

    return {
        pendingAuth,
        login,
        logout,
    }

})

import {useUserStore} from "~/stores/user.store";
import type {TelegramResponse} from "~/types/auth/telegram/telegram.types";

export const useAuthStore = defineStore('isAuth', () => {

    const user = useUserStore()
    const pendingAuth = ref<boolean>(false)

    const login = async () => {

        const token = crypto.randomUUID()

        window.open(
            `https://t.me/kinomanovNet_bot?start=${token}`,
            '_blank'
        )

        const supabase = useSupabaseClient()

        await supabase
            .from('auth_requests')
            .insert({token})
            .select()

        pendingAuth.value = true

        const startTime = Date.now()
        const TIMEOUT = 5000

        const interval = setInterval(async () => {
            console.log('TICK START')
            try {

                // ⛔ stop after 1 minute
                if (Date.now() - startTime > TIMEOUT) {
                    clearInterval(interval)
                    pendingAuth.value = false
                    console.warn('Auth timeout: user did not confirm within 1 minute')
                    return
                }

                const data: TelegramResponse = await $fetch(
                    '/api/auth/telegram-verify',
                    {
                        query: {token}
                    }
                )

                if (data?.data?.confirmed) {

                    pendingAuth.value = false

                    await $fetch('/api/auth/telegram-login', {
                        method: 'POST',
                        body: {
                            telegram_id: data.user.telegram_id
                        }
                    })
                    await user.refresh()
                    clearInterval(interval)
                }

            } catch (err) {
                console.error('Auth polling error:', err)
            }
            console.log('TICK END')
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

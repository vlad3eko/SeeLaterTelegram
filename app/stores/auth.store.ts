import {useUserStore} from "~/stores/user.store";
import type {TelegramResponse} from "~/types/auth/telegram/telegram.types";

export const useAuthStore = defineStore('isAuth', () => {

    const user = useUserStore()
    const pendingAuth = ref<boolean>(false)

    const login = async () => {

        const token = crypto.randomUUID()

        window.open(
            `https://t.me/@kinomanovNet_bot?start=${token}`,
            '_blank'
        )

        const supabase = useSupabaseClient()

        await supabase
            .from('auth_requests')
            .insert({
                token: token,
            })
            .select()

        pendingAuth.value = true

        const startInterval = setInterval(async () => {

                const data: TelegramResponse = await $fetch(
                    '/api/auth/telegram-verify',
                    {
                        query: {token}
                    }
                )

                if (data.data.confirmed) {

                    pendingAuth.value = false

                    await $fetch('/api/auth/telegram-login', {
                        method: 'POST',
                        body: {
                            telegram_id: data.user.telegram_id
                        }
                    })
                    await user.refresh()

                    clearInterval(startInterval)
                }
            }, 1000
        )
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

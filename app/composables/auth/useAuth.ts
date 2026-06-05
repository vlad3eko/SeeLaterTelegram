import type {TelegramResponse, TelegramUser} from "~/types/auth/telegram/telegram.types";

export const useAuth = () => {

    const {data: user, refresh, pending} =
        useAsyncData(
            'auth-user',
            () => $fetch('/api/auth/me')
        )

    const pendingAuth = ref<boolean>(false)

    const isAuth = computed(
        () => !!user.value
    )

    const loginWithTelegram = async () => {

        const token = crypto.randomUUID()

        const supabase = useSupabaseClient()

        await supabase
            .from('auth_requests')
            .insert({
                token: token,
            })
            .select()

        pendingAuth.value = true

        window.open(`https://t.me/bezkino_bot?start=${token}`)

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
                    await refresh()

                    clearInterval(startInterval)
                }
            }, 5000
        )
    }

    return {
        loginWithTelegram,
        user,
        isAuth,
        refresh,
        pendingAuth,
    }
}

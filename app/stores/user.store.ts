import type {UserTelegramTypes} from "~/types/user/telegram/user-telegram.types";

export const useUserStore = defineStore('user', () => {

    const data = ref<UserTelegramTypes | null>(null)

    const isAuth = computed(() => !!data.value)

    const clear = () => {
        data.value = null
    }

    const refresh = async () => {

        try {
            data.value = await $fetch('/api/auth/me')
        } catch (err) {
            clear()
        }
    }

    return {
        data,
        clear,
        isAuth,
        refresh
    }
})

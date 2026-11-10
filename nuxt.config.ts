import tailwindcss from "@tailwindcss/vite";

// Ключ, который модуль @nuxtjs/supabase отдаёт в браузер (runtimeConfig.public), должен быть
// публичным (publishable/anon), а НЕ service_role: service_role обходит RLS и в браузере недопустим.
// Сайт больше не обращается к Supabase из браузера (всё идёт через серверные роуты), поэтому здесь
// достаточно безопасной заглушки; настоящий publishable/anon ключ подхватится, если он задан в окружении.
const isServiceRoleKey = (value: string): boolean => {
    if (value.startsWith('sb_secret_')) return true

    const parts = value.split('.')
    if (parts.length !== 3) return false

    try {
        const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'))
        return payload?.role === 'service_role'
    } catch {
        return false
    }
}

const publicSupabaseKey = [
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_KEY,
    process.env.NUXT_PUBLIC_SUPABASE_KEY,
]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value) && !isServiceRoleKey(value!))
    ?? 'sb_publishable_not_used_in_browser'

// Серверный ключ (обходит RLS) попадает только в приватный runtimeConfig модуля и в браузер не уходит.
const supabaseServerKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',
    modules: ['@nuxtjs/supabase', '@nuxt/image', '@nuxtjs/color-mode', '@pinia/nuxt', 'nuxt-swiper', 'nuxt-easy-lightbox'],
    devtools: {enabled: true},
    css: ['./app/assets/css/main.css'],
    runtimeConfig: {
        tmdbApiKey: process.env.TMDB_API_KEY,
        telegramKey: process.env.TELEGRAM_TOKEN,
        telegramStorageChanel: process.env.TELEGRAM_MEDIA_STORAGE_CHAT_ID
    },
    nitro: {
        preset: 'vercel',
    },
    supabase: {
        url: process.env.SUPABASE_URL,
        key: publicSupabaseKey,
        ...(supabaseServerKey
            ? (supabaseServerKey.startsWith('sb_secret_')
                ? {secretKey: supabaseServerKey}
                : {serviceKey: supabaseServerKey})
            : {}),
        types: '@/types/database.types.ts',
        redirect: false,
    },
    app: {
        head: {
            link: [
                {
                    rel: 'stylesheet',
                    href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
                },
            ]
        }
    },
    vite: {
        plugins: [
            tailwindcss(),
        ],
    },
    vue: {
        compilerOptions: {
            isCustomElement: (tag) => tag.startsWith('swiper-'),
        },
    },
})

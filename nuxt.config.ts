import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',
    modules: ['@nuxtjs/supabase', '@nuxt/image', '@pinia/nuxt'],
    devtools: {enabled: true},
    css: ['./app/assets/css/main.css'],
    runtimeConfig: {
        tmdbApiKey: process.env.TMDB_API_KEY
    },
    supabase: {
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_PUBLISHABLE_KEY,
        types: '../types/database.types.ts',
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
})

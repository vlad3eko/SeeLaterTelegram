import {createClient} from "@supabase/supabase-js";
import {Telegraf} from "telegraf";

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const storageBot = new Telegraf(
    process.env.TELEGRAM_STORAGE_TOKEN!
)

export const getTelegramMediaCache = async (cacheKey: string) => {
    const {data,error} = await supabase
        .from('telegram_media_cache')
        .select('telegram_file_id')
        .eq('cache_key',cacheKey)
        .maybeSingle()

    if (error) throw error

    return data?.telegram_file_id ?? null
}

export const setTelegramMediaCache = async (
    cacheKey:string,
    telegramFileId:string
) => {
    const {error} = await supabase
        .from('telegram_media_cache')
        .upsert(
            {
                cache_key:cacheKey,
                telegram_file_id:telegramFileId,
                updated_at:new Date().toISOString()
            },
            {onConflict:'cache_key'}
        )

    if (error) throw error
}

export const uploadTelegramMedia = async (
    media: any[]
) => {
    return storageBot.telegram.sendMediaGroup(
        process.env.TELEGRAM_MEDIA_STORAGE_CHAT_ID!,
        media
    )
}

export const uploadTelegramPhoto = async (
    media: any
) => {
    return storageBot.telegram.sendPhoto(
        process.env.TELEGRAM_MEDIA_STORAGE_CHAT_ID!,
        media
    )
}

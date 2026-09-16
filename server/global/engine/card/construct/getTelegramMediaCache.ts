
import {createClient} from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const cachePrefix =
    process.env.TELEGRAM_DEV_TOKEN
        ? 'dev'
        : 'prod'

const cacheKey = (key: string) =>
    `${cachePrefix}_${key}`

export const getTelegramMediaCache = async (key: string) => {
    const {data, error} = await supabase
        .from('telegram_media_cache')
        .select('telegram_file_id')
        .eq('cache_key', cacheKey(key))
        .maybeSingle()

    if (error) throw error

    return data?.telegram_file_id ?? null
}

export const setTelegramMediaCache = async (
    key: string,
    telegramFileId: string
) => {
    const {error} = await supabase
        .from('telegram_media_cache')
        .upsert(
            {
                cache_key: cacheKey(key),
                telegram_file_id: telegramFileId,
                updated_at: new Date().toISOString()
            },
            {onConflict: 'cache_key'}
        )

    if (error) throw error
}

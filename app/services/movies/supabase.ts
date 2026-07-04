import {createClient} from "@supabase/supabase-js";

export const supabase = useSupabaseClient()

const config = useRuntimeConfig()

export const supabaseBot = createClient(
    config.supabase.secretKey,
    config.supabase.serviceKey
)

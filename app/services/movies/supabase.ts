import {createClient} from "@supabase/supabase-js";

export const supabase = useSupabaseClient()

export const supabaseBot = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!
)

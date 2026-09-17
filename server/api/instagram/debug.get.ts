export default defineEventHandler(() => {
    return {
        vercelEnv: process.env.VERCEL_ENV,

        instagramTokenExists:
            Boolean(process.env.INSTAGRAM_ACCESS_TOKEN),

        instagramTokenLength:
            process.env.INSTAGRAM_ACCESS_TOKEN?.length ?? 0,

        instagramAccountIdExists:
            Boolean(process.env.INSTAGRAM_ACCOUNT_ID),

        instagramAccountId:
            process.env.INSTAGRAM_ACCOUNT_ID ?? null
    }
})

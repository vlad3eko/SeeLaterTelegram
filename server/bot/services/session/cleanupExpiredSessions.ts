import {bot} from "#server/bot/bot";

export const cleanupExpiredSessions = async () => {
    await $fetch('/api/bot/session/editCleanupSession', {
        method: 'POST',
    })
}

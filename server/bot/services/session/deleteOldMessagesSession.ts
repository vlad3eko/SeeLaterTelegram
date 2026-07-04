export const deleteOldMessagesSession = async () => {
    await $fetch('/api/bot/session/deleteOldMessagesSession', {
        method: 'POST',
    })
}

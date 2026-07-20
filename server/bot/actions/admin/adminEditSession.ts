type AdminEditSession = {
    inlineMessageId: string
    mode: 'media' | 'text'
}


const sessions = new Map<number, AdminEditSession>()


export const setAdminEditSession = (
    userId:number,
    data:AdminEditSession
) => {
    sessions.set(userId, data)
}


export const getAdminEditSession = (
    userId:number
) => {
    return sessions.get(userId)
}


export const clearAdminEditSession = (
    userId:number
) => {
    sessions.delete(userId)
}

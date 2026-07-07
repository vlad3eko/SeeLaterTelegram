import {deleteOldMessagesSession} from "#server/bot/services/session/deleteOldMessagesSession";

export async function clear() {
    await deleteOldMessagesSession()

}

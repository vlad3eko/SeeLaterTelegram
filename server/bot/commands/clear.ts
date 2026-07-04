import {addSessionMessage} from "#server/bot/services/session/addSessionMessage";
import {cleanupExpiredSessions} from "#server/bot/services/session/cleanupExpiredSessions";

export async function clear() {
    await cleanupExpiredSessions()

}

import {deleteOldMessagesSession} from "#server/bot/services/session/deleteOldMessagesSession";

export async function commandClear(ctx: any) {
    await deleteOldMessagesSession(ctx.from.id)
}

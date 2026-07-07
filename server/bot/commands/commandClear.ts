import {deleteOldMessagesSession} from "#server/bot/services/session/deleteOldMessagesSession";

export async function commandClear(ctx: any) {
    console.log('body.id', ctx.from.id)

    await deleteOldMessagesSession(ctx.from.id)
}

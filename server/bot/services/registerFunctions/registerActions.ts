import {Telegraf} from "telegraf";
import {registerMediaActions} from "#server/bot/actions/media/registerMediaActions";
import {registerAuthAction} from "#server/bot/actions/auth/registerAuthActions";
import {registerDeleteActions} from "#server/bot/actions/delete/registerDeleteActions";
import {registerAdminActions} from "#server/bot/actions/admin/registerAdminActions";

export function registerActions(bot: Telegraf) {
    registerMediaActions(bot)
    registerAuthAction(bot)
    registerDeleteActions(bot)
    registerAdminActions(bot)
}

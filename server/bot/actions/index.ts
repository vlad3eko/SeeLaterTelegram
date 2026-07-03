import {Telegraf} from "telegraf";
import {registerMediaActions} from "#server/bot/actions/addMedia";
import {registerAuthAction} from "#server/bot/actions/auth";
import {registerDeleteActions} from "#server/bot/actions/delete";

export function registerActions(bot: Telegraf) {
    registerMediaActions(bot)
    registerAuthAction(bot)
    registerDeleteActions(bot)
}

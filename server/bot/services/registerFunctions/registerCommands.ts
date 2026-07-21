import {Telegraf} from "telegraf";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {commandStart} from "#server/bot/commands/commandStart";
import {commandHelp} from "#server/bot/commands/commandHelp";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {commandClear} from "#server/bot/commands/commandClear";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {getLastSearchQuery} from "~/utils/search/repository/tmdbRepository";
import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";
import {isSubscriber} from "#server/bot/handlers/channel/isSubscriber";
import {openInlineSearch} from "#server/bot/actions/admin/helpers/openInlineSearch";
import {genresConvert} from "~/utils/convert/genresConvert";
import type {ContentType} from "~/utils/search/strategy/enums";
import {CONTENT_TYPE_LABELS} from "~/utils/convert/library/enumsLibrary";

const authRequests = new Map()

export function registerCommands(bot: Telegraf) {
    bot.start(async (ctx: any) => {

        const text =
            ctx.message.text

        const payload =
            ctx.startPayload


        // =========================
        // РАСШИРЕННЫЙ ПОИСК
        // =========================

        if (payload === 'inline_settings') {

            // твоя текущая логика
            return
        }


        // =========================
        // ИСКАТЬ ДРУГОЕ
        // =========================

        if (payload === 'search') {

            await openInlineSearch(
                ctx,
                ''
            )

            return
        }


        // =========================
        // КОЛЛЕКЦИЯ
        // =========================

        if (payload === 'collection') {

            await openInlineSearch(
                ctx,
                '#collection'
            )

            return
        }


        // =========================
        // ПОХОЖИЕ
        // =========================

        if (payload?.startsWith('similar_')) {

            const [
                ,
                mediaType,
                mediaId
            ] =
                payload.split('_')


            const media =
                await $fetch(
                    '/api/bot/getMediaBot',
                    {
                        query: {
                            media: mediaType,
                            id: mediaId
                        }
                    }
                )


            const tag =
                CONTENT_TYPE_LABELS[
                    media.content_type as ContentType
                    ]


            const genres =
                genresConvert(
                    media.genres
                )


            const query =
                `#${tag} ${genres
                    .replaceAll('•', ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase()
                }`


            await openInlineSearch(
                ctx,
                query
            )


            return
        }


        // обычный /start
        await commandStart(
            ctx,
            authRequests
        )
    })
    bot.command('help', commandHelp)
    bot.command('clear', commandClear)
    bot.action('menu_bot', menuBot)
}

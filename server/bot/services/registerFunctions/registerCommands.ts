import {Telegraf} from "telegraf";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {commandStart} from "#server/bot/commands/commandStart";
import {commandHelp} from "#server/bot/commands/commandHelp";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {commandClear} from "#server/bot/commands/commandClear";
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


        // ========================================
        // РАСШИРЕННЫЙ ПОИСК
        // ========================================

        if (text.includes('inline_settings') || payload === 'inline_settings') {

            const messageStart =
                ctx.message.message_id

            await addMessageSession(
                ctx.from.id,
                SessionMessageType.Command,
                {
                    messageId: messageStart
                }
            )

            const checkSub =
                await isSubscriber(ctx)

            if (!checkSub)
                return

            const tagGet =
                (await getLastSearchQuery(ctx.from.id))
                    .map(
                        (tag: any) =>
                            `${tag ? '#' + tag : ''}`
                    )
                    .join(' ')

            const messageContinue =
                await ctx.reply(
                    'Вы перешли в расширенный поиск, нажмите кнопку ниже чтобы продолжить с места где остановились',
                    {
                        reply_markup:
                            keyboardSearchBot(
                                'Продолжить искать',
                                tagGet
                            )
                    }
                )

            await addMessageSession(
                ctx.from.id,
                SessionMessageType.SearchInline,
                {
                    messageId:
                    messageContinue.message_id
                }
            )

            return
        }

        // ========================================
        // ИСКАТЬ ДРУГОЕ
        // ========================================

        if (payload === 'search') {

            await openInlineSearch(ctx, '')
            return
        }

        // ========================================
        // КОЛЛЕКЦИЯ
        // ========================================

        if (payload === 'collection') {

            await openInlineSearch(ctx, '#collection')
            return
        }


        // ========================================
        // ПОХОЖИЕ
        // ========================================

        if (payload?.startsWith('similar_')) {

            const [, mediaType, mediaId, contentType] = payload.split('_')

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
                CONTENT_TYPE_LABELS[contentType as ContentType]

            console.log('[TAG registerCommands]', tag)
            const genres =
                genresConvert(media.genres)

            const query =
                `#${tag} ${
                    genres
                        .replaceAll('•', ' ')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .toLowerCase()
                }`

            await openInlineSearch(ctx, query)
            return
        }

        // ========================================
        // ОБЫЧНЫЙ /START
        // ========================================

        const message =
            ctx.message.message_id

        if (!message)
            return

        await commandStart(ctx, authRequests)

        await addMessageSession(
            ctx.from.id,
            SessionMessageType.Command,
            {
                messageId: message
            }
        )
    })

    bot.command('help', commandHelp)

    bot.command('clear', commandClear)

    bot.action('menu_bot', menuBot)
}

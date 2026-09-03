import {mainKeyboard} from "#server/bot/consts/buttons/replyKeyboard";
import {Telegraf} from "telegraf";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {isSubscriber} from "#server/bot/handlers/channel/isSubscriber";
import {getLastSearchQuery} from "#server/global/engine/search/repository/tmdbRepository";
import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";
import {openInlineSearch} from "#server/bot/actions/admin/helpers/openInlineSearch";
import {CONTENT_TYPE_LABELS} from "~/utils/convert/library/enumsLibrary";
import {ContentType} from "#server/global/engine/search/strategy/enums";
import {genresConvert} from "~/utils/convert/genresConvert";
import {commandStart} from "#server/bot/commands/commandStart";
import {commandHelp} from "#server/bot/commands/commandHelp";
import {commandClear} from "#server/bot/commands/commandClear";
import {commandContent} from "#server/bot/commands/commandContent";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";

const authRequests = new Map()

export function registerCommands(bot: Telegraf) {


    bot.start(async (ctx: any) => {

        const text =
            ctx.message.text

        const payload =
            ctx.startPayload

        const menu = await ctx.reply('Открыто главное меню', mainKeyboard)
        await addMessageSession(
            ctx.from.id,
            SessionMessageType.SearchInline,
            {
                messageId:
                menu.message_id
            }
        )

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
                            ),
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

        if (payload === 'search') {
            await openInlineSearch(ctx, '')
            return
        }


        if (payload === 'collection') {
            await openInlineSearch(ctx, '#collection')
            return
        }

        console.log('[START PAYLOAD]', {
            payload,
            startsWithCast: payload?.startsWith('cast_')
        })

        if (payload?.startsWith('cast_')) {
            const [, mediaType, mediaId] = payload.split('_')

            console.log('[CAST PAYLOAD]', {
                mediaType,
                mediaId
            })

            await openInlineSearch(
                ctx,
                `#${mediaType} ${mediaId} #cast`
            )

            return
        }

        if (payload?.startsWith('similar_')) {

            const [, mediaType, mediaId, contentType] = payload.split('_')

            const media =
                await tmdbFetch(
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
    bot.command('x', commandContent)
    bot.action('menu_bot', menuBot)
}

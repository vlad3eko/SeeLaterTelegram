import {adminStatusCommand, adminStatusQueueCancel, adminStatusReelCancel, adminStatusRefresh} from "#server/bot/actions/admin/status/adminStatus";

import {mainKeyboard} from "#server/bot/consts/buttons/replyKeyboard";
import {Telegraf} from "telegraf";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {isSubscriber} from "#server/bot/handlers/channel/isSubscriber";
import {getLastSearchQuery} from "#server/global/engine/search/repository/tmdbRepository";
import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";
import {openInlineSearch} from "#server/bot/actions/admin/helpers/openInlineSearch";
import {ContentType} from "#server/global/engine/search/strategy/enums";
import {commandStart} from "#server/bot/commands/commandStart";
import {saveTelegramUser} from "#server/bot/handlers/auth/success/saveTelegramUser";
import {commandHelp} from "#server/bot/commands/commandHelp";
import {commandClear} from "#server/bot/commands/commandClear";
import {jumpCollections, startCollections} from "#server/bot/actions/collections/collectionsActions";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {ADMIN_STATUS, ADMIN_STATUS_QUEUE_CANCEL, ADMIN_STATUS_REEL_CANCEL, LEGACY_MENU_BOT} from "#server/bot/callbacks/routes";
import {showSimilarList} from "#server/bot/actions/similar/similarActions";
import {contentTypeToTag} from "~/utils/convert/contentTypeConvert";

const authRequests = new Map()

/** Ссылки из кнопок поста в канале (server/bot/consts/buttons/buttonsBot.ts, ButtonContext 'channel'). */
const CHANNEL_LINK = /^(search|collection)$|^(media_cast|similar)_/

export function registerCommands(bot: Telegraf) {


    bot.start(async (ctx: any) => {

        // Ссылка пути мастера /g («Меню › Фильмы › …»): без главного меню.
        if (typeof ctx.startPayload === 'string' && ctx.startPayload.startsWith('g_')) {
            await jumpCollections(ctx, ctx.startPayload.slice(2))
            return
        }

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

        // Кнопки поста в канале («🔍 Поиск», «📦 Коллекция», «🎭 Актёры», «🔗 Похожее») ведут сюда ссылкой.
        // Пользоваться ими могут только подписчики — та же проверка, что у /start (и пользователь заносится в базу).
        if (CHANNEL_LINK.test(payload ?? '')) {
            await saveTelegramUser(ctx).catch(error => console.error('[START] Save user failed', error))
            if (!(await isSubscriber(ctx).catch(() => false))) return
        }

        if (payload === 'search') {
            await openInlineSearch(ctx, '')
            return
        }


        if (payload === 'collection') {
            await openInlineSearch(ctx, '#collection')
            return
        }

        if (payload.startsWith('media_cast_')) {

            const [, , contentType, mediaId] = payload.split('_')
            const type = contentTypeToTag[contentType as ContentType]

            await openInlineSearch(ctx,`#${type} ${mediaId} #cast`)
            return
        }

        // «🔗 Похожее» из канала: список похожих новым сообщением в боте.
        if (payload?.startsWith('similar_')) {
            const [, mediaType, mediaId, contentType] = payload.split('_')
            if ((mediaType === 'movie' || mediaType === 'tv') && Number(mediaId)) {
                await showSimilarList(ctx, {mediaType, mediaId: Number(mediaId), contentType: contentType as ContentType})
                    .catch(error => console.error('[SIMILAR] Start failed', error))
            }
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
    // Подборки (мастер, server/bot/actions/collections/); прежний генератор — commandContent.ts, не подключён.
    bot.command('g', startCollections)
    // Панель администратора: что сейчас идёт (Reels, очередь YouTube, связки).
    bot.command('status', adminStatusCommand)
    bot.action(ADMIN_STATUS.pattern, adminStatusRefresh)
    bot.action(ADMIN_STATUS_QUEUE_CANCEL.pattern, adminStatusQueueCancel)
    bot.action(ADMIN_STATUS_REEL_CANCEL.pattern, adminStatusReelCancel)
    // Кнопки menu_bot в коде больше нет: обработчик оставлен для старых сообщений.
    bot.action(LEGACY_MENU_BOT.pattern, menuBot)
}

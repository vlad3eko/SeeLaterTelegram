import {adminStatusCommand, adminStatusQueueCancel, adminStatusReelCancel, adminStatusRefresh} from "#server/bot/actions/admin/status/adminStatus";

import {mainKeyboard} from "#server/bot/consts/buttons/replyKeyboard";
import {Telegraf} from "telegraf";
import {addMessageSession} from "#server/bot/services/session/addMessageSession";
import {SessionMessageType} from "#server/bot/consts/types/SessionMessageTypes";
import {getLastSearchQuery} from "#server/global/engine/search/repository/tmdbRepository";
import {keyboardSearchBot} from "#server/bot/consts/buttons/keyboardBot";
import {openInlineSearch} from "#server/bot/actions/admin/helpers/openInlineSearch";
import {ContentType} from "#server/global/engine/search/strategy/enums";
import {commandStart} from "#server/bot/commands/commandStart";
import {ensureAccessOnStart, isActionPayload, parseMediaAction} from "#server/bot/handlers/channel/pendingActions";
import {startMediaAction} from "#server/bot/actions/media/startMediaAction";
import {commandHelp} from "#server/bot/commands/commandHelp";
import {commandClear} from "#server/bot/commands/commandClear";
import {jumpCollections, startCollections} from "#server/bot/actions/collections/collectionsActions";
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {ADMIN_STATUS, ADMIN_STATUS_QUEUE_CANCEL, ADMIN_STATUS_REEL_CANCEL, BUNDLE_LIST, IG_CAMPAIGN, IG_SAVE, LEGACY_MENU_BOT} from "#server/bot/callbacks/routes";
import {instagramCampaignAction, instagramSaveAction, startFromInstagram} from "#server/bot/actions/instagram/instagramSave";
import {isIgPayload} from "#server/global/engine/instagram/comments/token";
import {bundleListAction} from "#server/bot/actions/admin/bundleListAction";
import {showSimilarList} from "#server/bot/actions/similar/similarActions";
import {contentTypeToTag} from "~/utils/convert/contentTypeConvert";

const authRequests = new Map()

export function registerCommands(bot: Telegraf) {


    bot.start(async (ctx: any) => {

        // Ссылка пути мастера /g («Меню › Фильмы › …»): без главного меню.
        if (typeof ctx.startPayload === 'string' && ctx.startPayload.startsWith('g_')) {
            await jumpCollections(ctx, ctx.startPayload.slice(2))
            return
        }

        // Переход из Instagram (Direct после комментария «СОХРАНИТЬ»): сохранение фильма, без главного меню сверху.
        if (isIgPayload(ctx.startPayload)) {
            await startFromInstagram(ctx, ctx.startPayload)
                .catch(async error => {
                    console.error('[IG START]', error?.message ?? error)
                    await ctx.reply('Не получилось сохранить фильм. Попробуйте открыть ссылку ещё раз чуть позже.').catch(() => undefined)
                })
            return
        }

        // Действия из кнопок (пост в канале, карточки): нужна подписка на оба канала. Без неё действие
        // запоминается на 24 часа и выполнится само после подписки (server/bot/handlers/channel/pendingActions.ts).
        if (isActionPayload(ctx.startPayload)) {
            if (!(await ensureAccessOnStart(ctx, ctx.startPayload))) return
            if (parseMediaAction(ctx.startPayload)) {
                await startMediaAction(ctx, ctx.startPayload).catch(async error => {
                    console.error('[START] действие с тайтлом', error?.message ?? error)
                    await ctx.reply('Не получилось — попробуйте нажать кнопку ещё раз чуть позже.').catch(() => undefined)
                })
                return
            }
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

            // Повтор после подписки (pendingActions) приходит с message_id 0 — такого сообщения нет.
            if (messageStart) {
                await addMessageSession(
                    ctx.from.id,
                    SessionMessageType.Command,
                    {
                        messageId: messageStart
                    }
                )
            }

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

        // Кнопки поста в канале («🔍 Поиск», «📦 Коллекция», «🎭 Актёры», «🔗 Похожее») ведут сюда ссылкой;
        // подписка уже проверена выше (isActionPayload → ensureAccessOnStart).

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
    // «📋 Показать список» под итогом судьи связок (judge/notify.ts).
    bot.action(BUNDLE_LIST.pattern, bundleListAction)
    // Instagram «СОХРАНИТЬ»: фильм для нового Reel (администратор) и «Проверить и сохранить» (после подписки).
    bot.action(IG_CAMPAIGN.pattern, instagramCampaignAction)
    bot.action(IG_SAVE.pattern, instagramSaveAction)
    // Кнопки menu_bot в коде больше нет: обработчик оставлен для старых сообщений.
    bot.action(LEGACY_MENU_BOT.pattern, menuBot)
}

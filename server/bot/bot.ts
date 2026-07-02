import { Telegraf } from 'telegraf'
import { start } from '#server/bot/commands/start'
import { processTelegramAuth } from '#server/bot/services/auth/processTelegramAuth'
import { processMediaSearch } from '#server/bot/services/addMedia/processMediaSearch'
import { saveMedia } from '#server/bot/actions/addMedia/saveMedia'
import {nameMediaSearch} from '#server/bot/actions/addMedia/nameMediaSearch'
import { addMediaState } from '#server/bot/consts/addMedia/addMediaState'
import {menuBot} from "#server/bot/handlers/commands/start/menuBot";
import {selectMedia} from "#server/bot/actions/addMedia/selectMedia";

export const bot = new Telegraf(process.env.TELEGRAM_TOKEN!)
const authRequests = new Map()

// --- commands ---
bot.start(async (ctx) => {
    await start(ctx, authRequests)
})

// --- actions ---
bot.action('menu_bot', menuBot)

bot.action('check_sub', async (ctx) => {
    await processTelegramAuth(ctx, authRequests)
})

bot.action('add_media', async (ctx) => {
    await processMediaSearch(ctx)
})

bot.action(/^media_(\d+)_(movie|tv)$/, selectMedia)

bot.action(/^save_(\d+)_(\d+)_(movie|tv)$/, saveMedia)

bot.action(/^back_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery()

    if (!ctx.callbackQuery || !ctx.callbackQuery.message) {
        console.log('Не удалось получить ID сообщения для удаления');
        return;
    }

    // 3. Берем ID сообщения, НА КОТОРОМ была нажата кнопка «Сохранить»
    const currentButtonMessageId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.chat?.id;

    if (!chatId) return;

    try {
        // 4. Удаляем сообщение с кнопкой сохранения и одно сообщение НАД ним
        await ctx.telegram.deleteMessages(chatId, [
            currentButtonMessageId,
            currentButtonMessageId + 1
        ]);
    } catch (err) {
        console.log('Не удалось удалить старые сообщения:', err);
    }
})

bot.action(/^delete_all_(\d+)$/, async (ctx) => {
    // 1. Обязательно гасим часы на кнопке
    await ctx.answerCbQuery();

    // 2. Получаем количество сообщений из регулярного выражения (например, 5)
    const countToDelete = parseInt(ctx.match[1] ?? '0', 10);

    // 3. Проверяем, что сообщение существует и у него есть ID (защита от undefined)
    if (!ctx.callbackQuery || !ctx.callbackQuery.message) {
        console.log('Сообщение для удаления не найдено');
        return;
    }

    const currentId = ctx.callbackQuery.message.message_id;
    const chatId = ctx.chat?.id;

    if (!chatId) {
        console.log('ID чата не найден');
        return;
    }

    // 4. Генерируем массив идентификаторов для удаления
    const messagesToDelete: number[] = [];

    for (let i = 0; i < countToDelete; i++) {
        messagesToDelete.push(currentId - i);
    }

    try {
        // 5. Удаляем пачку сообщений за один запрос
        await ctx.telegram.deleteMessages(chatId, messagesToDelete);
    } catch (error) {
        // Кастим ошибку к типу Error, чтобы безопасно прочитать .message
        if (error instanceof Error) {
            console.log('Некоторые сообщения не удалось удалить:', error.message);
        } else {
            console.log('Неизвестная ошибка при удалении:', error);
        }
    }
});


// --- text handler ---
bot.on('text', async (ctx) => {

    const state = addMediaState.get(ctx.from.id)

    if (!state?.waitingMovie) return

    await nameMediaSearch(ctx)
})

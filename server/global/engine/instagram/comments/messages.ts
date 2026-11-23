/**
 * Тексты Instagram «СОХРАНИТЬ» (согласованы владельцем 23.11). Direct — до 1000 байт UTF-8
 * (лимит Meta), поэтому название обрезается. В «Запросах» Instagram видна только первая строка —
 * в ней сразу, от кого и про что сообщение. Ссылка в запросе становится нажимаемой после любого
 * ответа человека — об этом последняя строка.
 */
export type IgMediaType = 'movie' | 'tv'

const MAX_DIRECT_BYTES = 1000
const MAX_TITLE = 80

export const shortTitle = (title: string | null | undefined): string => {
    const clean = String(title ?? '').replace(/\s+/g, ' ').trim() || 'фильм из ролика'
    return clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1).trimEnd()}…` : clean
}

const noun = (mediaType: IgMediaType) => mediaType === 'tv' ? 'сериал' : 'фильм'
export const remind = (mediaType: IgMediaType) => mediaType === 'tv' ? 'напомнит о новых сериях' : 'напомнит, когда он выйдет'

/** Первое сообщение: ссылка на бота и шаги. */
export const linkDirectText = ({title, mediaType, link}: {title: string | null, mediaType: IgMediaType, link: string}): string => {
    const text = [
        `🎬 Киноманов: ссылка на «${shortTitle(title)}»`,
        '',
        `Вы написали «СОХРАНИТЬ» под нашим роликом. Вот бот, который сохранит этот ${noun(mediaType)} и ${remind(mediaType)}:`,
        link,
        '',
        'Как сохранить:',
        '1. Нажмите на ссылку — откроется Telegram-бот Киноманов.',
        '2. В чате с ботом нажмите кнопку «Старт» внизу.',
        '3. Если бот попросит, подпишитесь на наши Telegram-каналы.',
        `Готово: ${noun(mediaType)} в вашей коллекции.`,
        '',
        'Ссылка не нажимается? Ответьте на это сообщение чем угодно — она станет активной.'
    ].join('\n')
    return Buffer.byteLength(text) <= MAX_DIRECT_BYTES ? text : text.replace(`«${shortTitle(title)}»`, `«${shortTitle(title).slice(0, 30)}…»`)
}

/** Instagram уже привязан к Telegram: сохранили сразу, без ссылки. */
export const savedDirectText = ({title, mediaType}: {title: string | null, mediaType: IgMediaType}): string =>
    `✅ «${shortTitle(title)}» добавлен в вашу коллекцию Киноманов. Бот в Telegram ${remind(mediaType)}.`

export const alreadySavedDirectText = ({title, mediaType}: {title: string | null, mediaType: IgMediaType}): string =>
    `«${shortTitle(title)}» уже есть в вашей коллекции Киноманов. Бот в Telegram ${remind(mediaType)}.`

/** Ответ под комментарием: человек получает уведомление и знает, где искать Direct. */
export const linkCommentReply = (mediaType: IgMediaType): string =>
    `Готово! Ссылка на ${noun(mediaType)} уже у вас в Direct 🎬 Подпишитесь на нас — тогда сообщения будут приходить сразу во входящие.`

export const savedCommentReply = (): string =>
    'Сохранили в вашу коллекцию ✅ Напомним о выходе в Telegram.'

/**
 * Telegram: подтверждение привязки — только при первой привязке (Instagram не был привязан ни к кому).
 * Сохранение сразу работает, пока человек подписан на каналы; отвязать — /instagram_off.
 */
export const TELEGRAM_LINKED_TEXT =
    '📸 Instagram-аккаунт привязан к этому Telegram. Теперь фильмы и сериалы из наших Reels будут сохраняться сразу — ' +
    'достаточно написать «СОХРАНИТЬ» в комментариях, пока вы подписаны на наши каналы. Отвязать: /instagram_off'

/** Instagram уже привязан к другому Telegram: сохранили тому, кто открыл ссылку, привязку не переносим. */
export const TELEGRAM_LINKED_ELSEWHERE_TEXT =
    'Этот Instagram-аккаунт уже привязан к другому Telegram — сохраняем сюда, но автосохранение из комментариев ' +
    'останется там. Чтобы перенести, отправьте /instagram_off в том аккаунте и снова напишите «СОХРАНИТЬ» под нашим Reel.'

export const TELEGRAM_UNLINKED_TEXT =
    'Instagram отвязан. Фильмы из комментариев «СОХРАНИТЬ» больше не будут сохраняться сюда сами — будет приходить ссылка в Direct.'

export const TELEGRAM_NOT_LINKED_TEXT = 'К этому Telegram не привязан Instagram-аккаунт.'

/** У этого Telegram уже свой другой Instagram — его не заменяем. */
export const TELEGRAM_KEPT_TEXT =
    'К этому Telegram уже привязан другой Instagram-аккаунт — автосохранение из комментариев работает для него. ' +
    'Чтобы привязать этот, отправьте /instagram_off и снова напишите «СОХРАНИТЬ» под нашим Reel.'

/** Telegram: уже в коллекции (по типу тайтла). */
export const telegramAlreadySavedText = (title: string | null, mediaType: IgMediaType) =>
    `«${shortTitle(title)}» уже есть в вашей коллекции — бот ${remind(mediaType)}.`

export const TELEGRAM_SAVE_FAILED_TEXT = (title: string | null) =>
    `Не получилось сохранить «${shortTitle(title)}». Нажмите кнопку, чтобы попробовать ещё раз.`

/** `channels` — готовые строки списка каналов (channelLines в server/bot/handlers/channel/requiredChannels.ts). */
export const TELEGRAM_SUBSCRIBE_TEXT = (title: string | null, channels: string) =>
    `Почти готово! Чтобы сохранить «${shortTitle(title)}», подпишитесь на наши каналы:\n\n${channels}\n\n` +
    'Как только подпишетесь, сохранение пройдёт само. Если ничего не произошло — нажмите «Проверить и сохранить».'

export const TELEGRAM_ONE_MORE_TEXT = (channels: string) =>
    `Спасибо за подписку! Остался ещё один канал:\n\n${channels}`

/**
 * Новую ссылку не обещаем: Instagram отвечает один раз на человека под Reel (решение владельца 23.11),
 * повторный комментарий ответа не получит. Выход — найти тайтл в боте.
 */
export const TELEGRAM_EXPIRED_TEXT =
    'Ссылка устарела или уже использована. Найти и сохранить фильм можно прямо здесь — напишите его название боту.'

export const TELEGRAM_FOREIGN_TEXT =
    'Эта ссылка уже открыта в другом Telegram-аккаунте. Найти и сохранить фильм можно прямо здесь — напишите его название боту.'

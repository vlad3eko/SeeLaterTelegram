import {test} from 'node:test'
import assert from 'node:assert/strict'
import {matchesKeyword} from '../keyword'
import {createLeadToken, hashLeadToken, igStartLink, isIgPayload, parseIgPayload} from '../token'
import {linkCommentReply, linkDirectText, savedDirectText, shortTitle} from '../messages'
import {captionSimilarity, commentsCutoff, draftLeads, nextPollAt, newestTimestamp, rankCandidates, igCommentsMode, igCommentReplyEnabled, REPLIED_STATUSES} from '../plan'
import {classifyGraphError, flattenReplies, isAccountFailureText, isMissingObject} from '../graph'
import {IG_CAMPAIGN, IG_SAVE} from '#server/bot/callbacks/routes'

const NOW = new Date('2026-11-23T12:00:00Z')
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString()

test('ключевое слово: слово целиком, без регистра и знаков', () => {
    for (const text of ['Сохранить', 'сохранить!', 'Хочу СОХРАНИТЬ 🔥', '  сохранить,  пожалуйста', 'не сохранить', 'СОХРАНИТЬ.'])
        assert.equal(matchesKeyword(text), true, text)
    for (const text of ['не сохранять', 'сохранила', 'сохранится', 'пересохранить', 'сохранитьвсе', '', null, 'save'])
        assert.equal(matchesKeyword(text as any), false, String(text))
})

test('токен: 22 символа base64url, payload ig_ не длиннее 64, хэш стабилен', () => {
    const token = createLeadToken()
    assert.match(token, /^[A-Za-z0-9_-]{22}$/)
    assert.equal(parseIgPayload(`ig_${token}`), token)
    assert.ok(`ig_${token}`.length <= 64)
    assert.equal(hashLeadToken(token), hashLeadToken(token))
    assert.notEqual(hashLeadToken(token), hashLeadToken(createLeadToken()))
    assert.equal(igStartLink(token), `https://t.me/kinomanovNet_bot?start=ig_${token}`)
})

test('payload: чужие и испорченные ссылки не принимаются', () => {
    assert.equal(parseIgPayload('ig_short'), null)
    assert.equal(parseIgPayload(`ig_${'a'.repeat(23)}`), null)
    assert.equal(parseIgPayload(`ig_${'a'.repeat(21)}!`), null)
    assert.equal(parseIgPayload('g_movies'), null)
    assert.equal(parseIgPayload(undefined), null)
    assert.equal(isIgPayload('ig_whatever'), true)
    assert.equal(isIgPayload('similar_movie_1'), false)
})

test('Direct: шаги, ссылка, сериал/фильм и лимит 1000 байт', () => {
    const link = igStartLink(createLeadToken())
    const movie = linkDirectText({title: 'Дюна: Пророчество', mediaType: 'movie', link})
    assert.match(movie, /^🎬 Киноманов: ссылка на «Дюна: Пророчество»/)
    assert.ok(movie.includes(link))
    assert.ok(movie.includes('1. Нажмите на ссылку'))
    assert.ok(movie.includes('Ответьте на это сообщение чем угодно'))
    assert.ok(movie.includes('3. Если бот попросит, подпишитесь на наши Telegram-каналы.'))
    assert.match(linkDirectText({title: 'Шогун', mediaType: 'tv', link}), /этот сериал и напомнит о новых сериях/)
    const long = linkDirectText({title: 'Очень длинное название '.repeat(20), mediaType: 'movie', link})
    assert.ok(Buffer.byteLength(long) <= 1000)
    assert.equal(shortTitle(null), 'фильм из ролика')
    assert.ok(shortTitle('x'.repeat(200)).length <= 80)
    assert.equal(savedDirectText({title: 'Новая эра', mediaType: 'movie', releaseDate: '2026-12-03', today: '2026-11-23'}),
        '✅ Фильм «Новая эра» сохранили в вашу коллекцию. Напомним, когда он выйдет.\n\nКоллекция и напоминания — в Telegram-боте Киноманов:\nhttps://t.me/kinomanovNet_bot')
    assert.equal(savedDirectText({title: 'Шогун', mediaType: 'tv', releaseDate: '2024-02-27', today: '2026-11-23', already: true}).split('\n')[0],
        '✅ Сериал «Шогун» уже в вашей коллекции. Напомним о новых сериях.')
    assert.equal(savedDirectText({title: 'Начало', mediaType: 'movie', releaseDate: '2010-07-15', today: '2026-11-23'}).split('\n')[0],
        '✅ Фильм «Начало» добавили в вашу коллекцию. Смотрите обновления в боте.')
    assert.equal(linkCommentReply('movie'), 'Готово! Ссылка на фильм уже у вас в Direct 🎬 Подпишитесь на нас — тогда сообщения будут приходить сразу во входящие.')
})

test('комментарии → записи: ключ, свои, повторы человека, старше 7 дней', () => {
    const comments = [
        {id: 'c5', text: 'Сохранить', timestamp: at(1), from: {id: 'u1'}},          // второй от u1 — duplicate
        {id: 'c4', text: 'круто', timestamp: at(2), from: {id: 'u2'}},              // без ключа — пропуск
        {id: 'c3', text: 'сохранить', timestamp: at(3), from: {id: 'me'}},          // свой — пропуск
        {id: 'c2', text: 'СОХРАНИТЬ!', timestamp: at(4), from: {id: 'u1'}},         // первый от u1 — queued
        {id: 'c1', text: 'сохранить', timestamp: at(8 * 24 * 60), from: {id: 'u3'}}, // старый — expired
        {id: 'c0', text: 'сохранить', timestamp: at(5), from: {id: 'u4'}}           // уже был в базе — duplicate
    ]
    const drafts = draftLeads(comments, {account: 'me', knownCommenters: new Set(['u4']), now: NOW})
    const status = Object.fromEntries(drafts.map(draft => [draft.comment_id, draft.status]))
    assert.deepEqual(status, {c1: 'expired', c0: 'duplicate', c2: 'queued', c5: 'duplicate'})
})

test('режим log: записи logged, без duplicate внутри прохода; после send ответ только новым', () => {
    const comments = [
        {id: 'c2', text: 'сохранить', timestamp: at(1), from: {id: 'u1'}},
        {id: 'c1', text: 'сохранить', timestamp: at(2), from: {id: 'u1'}},
        {id: 'c0', text: 'сохранить', timestamp: at(8 * 24 * 60), from: {id: 'u2'}}
    ]
    const logged = draftLeads(comments, {account: 'me', knownCommenters: new Set(), now: NOW, mode: 'log'})
    assert.deepEqual(Object.fromEntries(logged.map(draft => [draft.comment_id, draft.status])), {c0: 'expired', c1: 'logged', c2: 'logged'})
    // Записи logged не входят в «уже ответили» — новый комментарий того же человека в send получит ответ.
    assert.equal((REPLIED_STATUSES as readonly string[]).includes('logged'), false)
    const later = draftLeads([{id: 'c3', text: 'сохранить', timestamp: at(0), from: {id: 'u1'}}], {account: 'me', knownCommenters: new Set(), now: NOW})
    assert.equal(later[0]!.status, 'queued')
})

test('повторный «СОХРАНИТЬ»: ответ, если прежний не ушёл; нет — если ушёл', () => {
    for (const status of ['send_failed', 'expired', 'logged', 'duplicate']) assert.equal((REPLIED_STATUSES as readonly string[]).includes(status), false, status)
    for (const status of ['queued', 'sending', 'sent', 'send_unknown', 'started', 'saved', 'already_saved', 'auto_saved'])
        assert.equal((REPLIED_STATUSES as readonly string[]).includes(status), true, status)
})

test('ответы в ветках разворачиваются в общий список', () => {
    const flat = flattenReplies([
        {id: 'a', timestamp: at(1), replies: {data: [{id: 'a1', text: 'сохранить', timestamp: at(0), from: {id: 'u1'}}]}},
        {id: 'b', timestamp: at(2)}
    ] as any)
    assert.deepEqual(flat.map(comment => comment.id), ['a', 'a1', 'b'])
    assert.equal('replies' in flat[0]!, false)
})

test('частота опроса и граница чтения', () => {
    const after = (date: Date | null) => date!.getTime() - NOW.getTime()
    // Свежий Reel (до 2 суток) — 3 минуты, срок на 30 с раньше запуска таймера.
    assert.equal(after(nextPollAt(at(60), NOW)), 3 * 60_000 - 30_000)
    assert.equal(after(nextPollAt(at(48 * 60 - 1), NOW)), 3 * 60_000 - 30_000)
    // До 7 дней — 7 минут.
    assert.equal(after(nextPollAt(at(48 * 60), NOW)), 7 * 60_000 - 30_000)
    assert.equal(after(nextPollAt(at(7 * 24 * 60 - 1), NOW)), 7 * 60_000 - 30_000)
    // До 30 дней — 2 часа: новый комментарий под старым Reel тоже получает ответ (7 дней от комментария).
    assert.equal(after(nextPollAt(at(7 * 24 * 60), NOW)), 2 * 3600_000 - 30_000)
    assert.equal(after(nextPollAt(at(29 * 24 * 60), NOW)), 2 * 3600_000 - 30_000)
    // Лимит Meta больше половины — вдвое реже: 6 и 14 минут.
    assert.equal(after(nextPollAt(at(60), NOW, {slow: true})), 6 * 60_000 - 30_000)
    assert.equal(after(nextPollAt(at(4 * 24 * 60), NOW, {slow: true})), 14 * 60_000 - 30_000)
    assert.equal(nextPollAt(at(30 * 24 * 60), NOW), null)
    assert.equal(commentsCutoff(at(10), at(100), NOW), NOW.getTime() - 25 * 60_000)
    assert.equal(commentsCutoff(null, at(100), NOW), NOW.getTime() - 115 * 60_000)
    assert.equal(newestTimestamp([{id: 'a', timestamp: at(3)}, {id: 'b', timestamp: at(1)}], at(10)), at(1))
    assert.equal(newestTimestamp([], at(10)), at(10))
})

test('варианты фильма для Reel: похожая подпись первой, без повторов, только рядом по времени', () => {
    const jobs = [
        {media_id: 1, media_type: 'movie' as const, instagram_caption: 'Дюна пророчество трейлер сериала HBO', published_at: at(60)},
        {media_id: 2, media_type: 'movie' as const, instagram_caption: 'Новый Бэтмен смотрите трейлер', published_at: at(30)},
        {media_id: 1, media_type: 'movie' as const, instagram_caption: 'Дюна пророчество', published_at: at(20)},
        {media_id: 3, media_type: 'tv' as const, instagram_caption: 'Дюна пророчество', published_at: at(5 * 24 * 60)}
    ]
    const ranked = rankCandidates({caption: 'Дюна: Пророчество — трейлер сериала', timestamp: NOW.toISOString()}, jobs, job => `t${job.media_id}`)
    assert.deepEqual(ranked.map(candidate => candidate.mediaId), [1, 2])
    assert.ok(captionSimilarity('a b c', '') === 0)
})

test('ошибки Meta: лимит, уже отвечено, токен, неизвестный исход, отказ', () => {
    assert.equal(classifyGraphError({status: 400, code: 613}), 'rate')
    assert.equal(classifyGraphError({status: 400, code: -1, subcode: 2534023}), 'already')
    assert.equal(classifyGraphError({status: 401, code: 190}), 'token')
    assert.equal(classifyGraphError({status: 0}), 'unknown')
    assert.equal(classifyGraphError({status: 502}), 'unknown')
    assert.equal(classifyGraphError({status: 400, code: 2}), 'unknown')
    assert.equal(classifyGraphError({status: 400, code: 10, subcode: 2534022}), 'denied')
    assert.equal(classifyGraphError({status: 400, code: 100}), 'denied')
    // Нет прав или возможности у приложения — общая ошибка, не списывается на комментарий.
    assert.equal(classifyGraphError({status: 403, code: 10}), 'config')
    assert.equal(classifyGraphError({status: 403, code: 200}), 'config')
    assert.equal(classifyGraphError({status: 400, code: 3}), 'config')
    assert.equal(classifyGraphError({status: 400, code: 230, subcode: 2534014}), 'denied')
    assert.equal(isAccountFailureText('token HTTP 401 code=190: expired'), true)
    assert.equal(isAccountFailureText('config HTTP 403 code=10: no'), true)
    assert.equal(isAccountFailureText('denied HTTP 400 code=100: no'), false)
    assert.equal(isMissingObject({code: 100, subcode: 33}), true)
    assert.equal(isMissingObject({code: 100}), false)
})

test('режимы из env: по умолчанию выключено, ответ под комментарием включён', () => {
    assert.equal(igCommentsMode(undefined), 'off')
    assert.equal(igCommentsMode('log'), 'log')
    assert.equal(igCommentsMode('send'), 'send')
    assert.equal(igCommentsMode('yes'), 'off')
    assert.equal(igCommentReplyEnabled(undefined), true)
    assert.equal(igCommentReplyEnabled('off'), false)
})

test('кнопки: uuid туда и обратно, до 64 байт', () => {
    const id = '0f8c2a4e-1b2c-4d5e-8f90-123456789abc'
    for (const choice of [0, 2, 'n'] as const) {
        const data = IG_CAMPAIGN.encode({campaignId: id, choice})
        assert.ok(Buffer.byteLength(data) <= 64)
        assert.deepEqual(IG_CAMPAIGN.decode(data.match(IG_CAMPAIGN.pattern)!), {campaignId: id, choice})
    }
    const save = IG_SAVE.encode({leadId: id})
    assert.deepEqual(IG_SAVE.decode(save.match(IG_SAVE.pattern)!), {leadId: id})
})

test('обязательные каналы: подписка на оба, канал из апдейта, строки списка', async () => {
    const {missingChannels, requiredChannelByUsername, channelLines, isMemberStatus} = await import('#server/bot/handlers/channel/requiredChannels')
    const {REQUIRED_CHANNELS} = await import('#server/global/oneLinkApp')
    const {TELEGRAM_SUBSCRIBE_TEXT} = await import('../messages')
    const fake = (statuses: Record<string, string | Error>) => ({
        getChatMember: async (chat: string) => {
            const status = statuses[chat]
            if (status instanceof Error) throw status
            return {status}
        }
    })
    assert.equal(REQUIRED_CHANNELS.length, 2)
    assert.deepEqual(await missingChannels(fake({'@kinomanovnet': 'member', '@Zerno_Kopeica': 'administrator'}), 1), [])
    assert.deepEqual((await missingChannels(fake({'@kinomanovnet': 'member', '@Zerno_Kopeica': 'left'}), 1)).map(c => c.chat), ['@Zerno_Kopeica'])
    assert.deepEqual((await missingChannels(fake({'@kinomanovnet': new Error('400'), '@Zerno_Kopeica': 'kicked'}), 1)).length, 2)
    assert.equal(requiredChannelByUsername('zerno_kopeica')?.chat, '@Zerno_Kopeica')
    assert.equal(requiredChannelByUsername('kinomanovnet')?.chat, '@kinomanovnet')
    assert.equal(requiredChannelByUsername('other'), undefined)
    assert.equal(isMemberStatus('restricted', true), true)
    assert.equal(isMemberStatus('restricted', false), false)
    assert.equal(isMemberStatus('left'), false)
    const lines = channelLines([REQUIRED_CHANNELS[1]])
    assert.match(lines, /^✅ 🎬 Киноманов — новые фильмы/)
    assert.match(lines, /\n• 👨‍💻 Канал разработчика/)
    assert.match(TELEGRAM_SUBSCRIBE_TEXT('Дюна', lines), /сохранение пройдёт само/)
})

test('отложенные действия: какие ссылки /start запоминаются, разбор «Сохранить»/«Удалить», ссылка в бота', async () => {
    const {isActionPayload, mediaActionPayload, parseMediaAction, botStartLink} = await import('#server/bot/handlers/channel/actionPayload')
    for (const payload of ['search', 'collection', 'inline_settings', 'media_cast_movies_27205', 'similar_movie_27205_movies', 'save_movie_27205', 'unsave_tv_1399'])
        assert.equal(isActionPayload(payload), true, payload)
    for (const payload of ['', 'g_movies', 'ig_' + 'a'.repeat(22), 'save_book_1', 'save_movie_', 'a1b2c3d4e5f6', 'search_x', undefined, 'similar_' + 'x'.repeat(60)])
        assert.equal(isActionPayload(payload), false, String(payload))
    assert.equal(mediaActionPayload('save', 'movie', 27205), 'save_movie_27205')
    assert.deepEqual(parseMediaAction('unsave_tv_1399'), {action: 'unsave', mediaType: 'tv', mediaId: 1399})
    assert.equal(parseMediaAction('search'), null)
    assert.equal(botStartLink({botInfo: {username: 'test_bot'}}, 'save_movie_1'), 'https://t.me/test_bot?start=save_movie_1')
    assert.equal(botStartLink({}, 'search'), 'https://t.me/kinomanovNet_bot?start=search')
})

test('отложенные действия в users.pending_actions: повтор в конец, 24 часа, не больше 10', async () => {
    const {addPending, livePending} = await import('#server/bot/handlers/channel/actionPayload')
    const now = NOW.getTime()
    let list = addPending(null, 'save_movie_1', now - 60_000)
    list = addPending(list, 'search', now - 30_000)
    list = addPending(list, 'save_movie_1', now)
    assert.deepEqual(list.map(item => item.payload), ['search', 'save_movie_1'])
    const old = [{payload: 'save_movie_9', at: at(25 * 60)}, {payload: 'bad payload', at: at(1)}, ...list]
    assert.deepEqual(livePending(old, now).map(item => item.payload), ['search', 'save_movie_1'])
    let many: any = []
    for (let id = 1; id <= 12; id++) many = addPending(many, `save_movie_${id}`, now)
    assert.equal(many.length, 10)
    assert.equal(many[0].payload, 'save_movie_3')
    assert.deepEqual(livePending('not an array', now), [])
})

test('тексты: новую ссылку не обещаем, «уже в коллекции» по типу', async () => {
    const {TELEGRAM_EXPIRED_TEXT, TELEGRAM_FOREIGN_TEXT, telegramAlreadySavedText} = await import('../messages')
    for (const text of [TELEGRAM_EXPIRED_TEXT, TELEGRAM_FOREIGN_TEXT]) {
        assert.equal(/пришл[её]м/.test(text), false, text)
        assert.match(text, /напишите его название боту/)
    }
    assert.match(telegramAlreadySavedText('Шогун', 'tv'), /о новых сериях/)
    assert.match(telegramAlreadySavedText('Дюна', 'movie'), /когда он выйдет/)
})

test('кампания: текст администратору по режиму и состоянию', async () => {
    const {campaignAdminText, decidedText} = await import('../campaigns')
    const campaign = {permalink: 'https://instagram.com/reel/x', published_at: null, candidates: [{mediaId: 1, mediaType: 'movie' as const, title: 'Дюна'}]}
    assert.match(campaignAdminText(campaign, 'send'), /Это «Дюна»\? Без ответа через 5 минут «СОХРАНИТЬ» включится само\.$/)
    assert.match(campaignAdminText(campaign, 'log'), /Режим log/)
    assert.match(campaignAdminText({...campaign, candidates: []}, 'send'), /не нашёлся/)
    assert.equal(decidedText({status: 'active', title: 'Дюна', permalink: 'L'}, 'send'), '✅ «Дюна» — «СОХРАНИТЬ» включено\nL')
    assert.equal(decidedText({status: 'active', title: 'Дюна', permalink: 'L'}, 'send', {auto: true}), '✅ «Дюна» — «СОХРАНИТЬ» включено (без ответа за 5 минут)\nL')
    assert.match(decidedText({status: 'active', title: 'Дюна'}, 'log'), /режим log/)
    assert.match(decidedText({status: 'ignored'}), /Без «СОХРАНИТЬ»/)
    assert.match(decidedText({status: 'completed', title: 'Дюна'}), /завершено/)
})

test('администратор: старая кнопка не меняет фильм у идущей кампании', async () => {
    const {decideCampaign} = await import('../campaigns')
    const row = {id: 'c', status: 'active', title: 'Дюна', permalink: null, candidates: [{mediaId: 2, mediaType: 'tv', title: 'Шогун'}]}
    const updates: unknown[] = []
    const chain: any = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({data: row, error: null}),
        update: (fields: unknown) => { updates.push(fields); return chain }
    }
    const supabase = {from: () => chain}
    const result = await decideCampaign(supabase, 'c', 0, 'send')
    assert.deepEqual(updates, [])
    assert.match(result!.text, /«Дюна»/)
})

test('ошибка токена или прав из любого шага — предупреждение администратору', async () => {
    const {accountFailure} = await import('../graph')
    assert.equal(accountFailure({discover: {found: 0}, poll: {errors: ['denied HTTP 400: x']}}), null)
    assert.equal(accountFailure({poll: {errors: ['config HTTP 403 code=10: no']}}), 'config HTTP 403 code=10: no')
    assert.equal(accountFailure({discover: {error: 'token HTTP 0: нет INSTAGRAM_ACCESS_TOKEN'}}), 'token HTTP 0: нет INSTAGRAM_ACCESS_TOKEN')
    assert.equal(accountFailure({send: {accountError: 'token HTTP 401 code=190: x'}}), 'token HTTP 401 code=190: x')
})

test('вебхук: проверка подписки — только наш токен и mode=subscribe', async () => {
    const {verifySubscription} = await import('../webhook')
    assert.equal(verifySubscription({'hub.mode': 'subscribe', 'hub.verify_token': 'abc', 'hub.challenge': '42'}, 'abc'), '42')
    assert.equal(verifySubscription({'hub.mode': 'subscribe', 'hub.verify_token': 'abd', 'hub.challenge': '42'}, 'abc'), null)
    assert.equal(verifySubscription({'hub.mode': 'unsubscribe', 'hub.verify_token': 'abc', 'hub.challenge': '42'}, 'abc'), null)
    assert.equal(verifySubscription({'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '42'}, undefined), null)
})

test('вебхук: подпись sha256 — подходит любой из двух секретов, чужая и пустая отклоняются', async () => {
    const {createHmac} = await import('node:crypto')
    const {signatureValid} = await import('../webhook')
    const body = '{"object":"instagram"}'
    const sign = (secret: string) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
    assert.equal(signatureValid(body, sign('ig'), ['ig', 'meta']), true)
    assert.equal(signatureValid(body, sign('meta'), [undefined, 'meta']), true)
    assert.equal(signatureValid(body, sign('other'), ['ig', 'meta']), false)
    assert.equal(signatureValid(body, undefined, ['ig']), false)
    assert.equal(signatureValid(body, sign('ig'), [undefined, undefined]), false)
    assert.equal(signatureValid(body + ' ', sign('ig'), ['ig']), false)
})

test('вебхук: Reels с «СОХРАНИТЬ» — без своих ответов, других полей и дублей', async () => {
    const {keywordMediaIds} = await import('../webhook')
    const change = (media: string, text: string, from = 'u1', field = 'comments') => ({field, value: {id: 'c' + Math.random(), text, from: {id: from}, media: {id: media}}})
    const payload = {object: 'instagram', entry: [{id: 'acc', changes: [
        change('r1', 'Сохранить!'), change('r1', 'хочу сохранить'), change('r2', 'сохранила'),
        change('r3', 'Сохранить', 'acc'), change('r4', 'Сохранить', 'u2', 'mentions')
    ]}, {changes: [change('r5', 'сохранить 🔥')]}]}
    assert.deepEqual(keywordMediaIds(payload, 'acc'), ['r1', 'r5'])
    assert.deepEqual(keywordMediaIds({}, 'acc'), [])
    assert.deepEqual(keywordMediaIds({entry: [{changes: [{field: 'comments', value: {text: 'сохранить'}}]}]}, 'acc'), [])
})

test('ответ под комментарием привязанному: напоминание только до выхода, сериал — о новых сериях', async () => {
    const {savedCommentReply} = await import('../messages')
    const today = '2026-11-23'
    assert.equal(savedCommentReply({title: 'Новая эра', mediaType: 'movie', releaseDate: '2026-12-03', today}),
        'Фильм «Новая эра» добавлен в вашу коллекцию в боте ✅ Напомним, когда он выйдет.')
    assert.equal(savedCommentReply({title: 'Начало', mediaType: 'movie', releaseDate: '2010-07-15', today}),
        'Фильм «Начало» добавили в вашу коллекцию ✅ Смотрите обновления в боте.')
    assert.equal(savedCommentReply({title: 'Начало', mediaType: 'movie', releaseDate: '2026-11-23', today}),
        'Фильм «Начало» добавили в вашу коллекцию ✅ Смотрите обновления в боте.', 'вышел сегодня — уже вышел')
    assert.equal(savedCommentReply({title: 'Начало', mediaType: 'movie', releaseDate: '2010-07-15', today, already: true}),
        'Фильм «Начало» уже в вашей коллекции ✅ Смотрите обновления в боте.')
    assert.equal(savedCommentReply({title: 'Без даты', mediaType: 'movie', releaseDate: null, today}),
        'Фильм «Без даты» добавлен в вашу коллекцию в боте ✅ Напомним, когда он выйдет.')
    assert.equal(savedCommentReply({title: 'Шогун', mediaType: 'tv', releaseDate: '2024-02-27', today, already: true}),
        'Сериал «Шогун» уже в вашей коллекции в боте ✅ Напомним о новых сериях.')
    assert.equal(savedCommentReply({title: 'Новый', mediaType: 'tv', releaseDate: '2027-02-18T00:00:00', today}),
        'Сериал «Новый» добавлен в вашу коллекцию в боте ✅ Напомним, когда он выйдет.')
})

test('расход лимита Instagram из заголовка: наибольший показатель, ожидание; мусор — null', async () => {
    const {parseBucUsage} = await import('../graph')
    assert.deepEqual(parseBucUsage('{"17841":[{"type":"instagram","call_count":4,"total_cputime":9,"total_time":4,"estimated_time_to_regain_access":0}]}'), {percent: 9, regainMinutes: 0})
    assert.deepEqual(parseBucUsage('{"1":[{"type":"pages","call_count":1}],"2":[{"type":"instagram","call_count":90,"total_cputime":3,"total_time":1,"estimated_time_to_regain_access":12}]}'), {percent: 90, regainMinutes: 12})
    assert.equal(parseBucUsage(null), null)
    assert.equal(parseBucUsage('не json'), null)
    assert.equal(parseBucUsage('{}'), null)
})

test('кампания без ответа 5 минут включается сама с лучшим вариантом; без вариантов и уже решённая — нет', async () => {
    const {autoApproveCampaigns} = await import('../campaigns')
    const rows = [
        {id: 'a', permalink: 'LA', admin_message_id: 11, candidates: [{mediaId: 1, mediaType: 'movie', title: 'Дюна'}, {mediaId: 2, mediaType: 'tv', title: 'Шогун'}]},
        {id: 'b', permalink: 'LB', admin_message_id: 12, candidates: []},
        {id: 'c', permalink: 'LC', admin_message_id: 13, candidates: [{mediaId: 3, mediaType: 'movie', title: 'Чужой'}]}
    ]
    const filters: Array<[string, unknown]> = []
    const updates: Array<{id: unknown, fields: any}> = []
    let pendingId: unknown
    const chain: any = {
        select: () => chain, limit: async () => ({data: rows, error: null}),
        eq: (column: string, value: unknown) => { filters.push([column, value]); if (column === 'id') pendingId = value; return chain },
        gt: (column: string, value: unknown) => { filters.push([column, value]); return chain },
        lt: (column: string, value: unknown) => { filters.push([column, value]); return chain },
        update: (fields: any) => ({
            eq: (_c: string, id: unknown) => ({eq: () => ({select: async () => {
                updates.push({id, fields})
                // «c» уже решили нажатием — условное обновление ничего не меняет.
                return {data: id === 'c' ? [] : [{id, status: 'active', title: fields.title, permalink: 'LA'}], error: null}
            }})})
        })
    }
    const edited: Array<[unknown, string]> = []
    const telegram = {editMessageText: async (_chat: unknown, messageId: unknown, _i: unknown, text: string) => { edited.push([messageId, text]) }}
    const now = new Date('2026-11-23T12:00:00Z')
    const approved = await autoApproveCampaigns({from: () => chain}, telegram, now, 'send')
    assert.equal(approved, 1)
    assert.deepEqual(updates.map(u => u.id), ['a', 'c'])
    assert.equal(updates[0]!.fields.title, 'Дюна')
    assert.equal(updates[0]!.fields.media_type, 'movie')
    assert.deepEqual(edited, [[11, '✅ «Дюна» — «СОХРАНИТЬ» включено (без ответа за 5 минут)\nLA']])
    assert.deepEqual(filters.find(([column]) => column === 'updated_at'), ['updated_at', '2026-11-23T11:55:00.000Z'])
    void pendingId
})

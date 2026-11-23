import {test} from 'node:test'
import assert from 'node:assert/strict'
import {matchesKeyword} from '../keyword'
import {createLeadToken, hashLeadToken, igStartLink, isIgPayload, parseIgPayload} from '../token'
import {linkCommentReply, linkDirectText, savedDirectText, shortTitle} from '../messages'
import {captionSimilarity, commentsCutoff, draftLeads, nextPollAt, newestTimestamp, rankCandidates, igCommentsMode, igCommentReplyEnabled} from '../plan'
import {classifyGraphError} from '../graph'
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
    assert.ok(!movie.includes('3.'))
    assert.match(linkDirectText({title: 'Шогун', mediaType: 'tv', link}), /этот сериал и напомнит о новых сериях/)
    const long = linkDirectText({title: 'Очень длинное название '.repeat(20), mediaType: 'movie', link})
    assert.ok(Buffer.byteLength(long) <= 1000)
    assert.equal(shortTitle(null), 'фильм из ролика')
    assert.ok(shortTitle('x'.repeat(200)).length <= 80)
    assert.match(savedDirectText({title: 'Шогун', mediaType: 'tv'}), /^✅ «Шогун» добавлен/)
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

test('частота опроса и граница чтения', () => {
    assert.equal(nextPollAt(at(60), NOW)!.getTime() - NOW.getTime(), 5 * 60_000)
    assert.equal(nextPollAt(at(4 * 24 * 60), NOW)!.getTime() - NOW.getTime(), 30 * 60_000)
    assert.equal(nextPollAt(at(7 * 24 * 60), NOW), null)
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
    assert.match(TELEGRAM_SUBSCRIBE_TEXT('Дюна', lines), /фильм сохранится сам/)
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

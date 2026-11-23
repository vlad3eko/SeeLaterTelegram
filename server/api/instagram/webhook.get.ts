import {verifySubscription} from '#server/global/engine/instagram/comments/webhook'

/** Проверка подписки вебхука Meta (кнопка «Подтвердить и сохранить»): вернуть hub.challenge как текст. */
export default defineEventHandler((event) => {
    const challenge = verifySubscription(getQuery(event))
    if (challenge === null) throw createError({statusCode: 403, statusMessage: 'Forbidden'})
    setHeader(event, 'content-type', 'text/plain; charset=utf-8')
    return challenge
})

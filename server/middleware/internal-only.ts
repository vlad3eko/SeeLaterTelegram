import {timingSafeEqual} from 'node:crypto'
import {getInternalSecret, INTERNAL_HEADER} from "#server/utils/api/internalSecret";
import {isInternalOnlyPath} from "#server/utils/api/internalPaths";

const secretMatches = (received: string, expected: string): boolean => {
    const receivedBuffer = Buffer.from(received)
    const expectedBuffer = Buffer.from(expected)

    return receivedBuffer.length === expectedBuffer.length &&
        timingSafeEqual(receivedBuffer, expectedBuffer)
}

// Закрывает служебные роуты от внешнего мира. Бот вызывает их через internalFetch и
// передаёт заголовок с секретом; снаружи секрета нет, поэтому такие запросы получают 403.
export default defineEventHandler(async (event) => {

    const received = getHeader(event, INTERNAL_HEADER)
    const internalOnly = isInternalOnlyPath(event.path)

    // Обычные запросы сайта: никакой работы.
    if (!received && !internalOnly) return

    const secret = await getInternalSecret()
    const isInternal = Boolean(secret && received && secretMatches(received, secret))

    // Роуты с двойным режимом (например, /api/:media) смотрят на этот флаг.
    event.context.isInternal = isInternal

    if (internalOnly && !isInternal) {
        throw createError({statusCode: 403, statusMessage: 'Forbidden'})
    }
})

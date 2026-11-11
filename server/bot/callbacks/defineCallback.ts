/**
 * Контракт одной callback-кнопки Telegram.
 *
 * Строка callback_data собирается и разбирается только здесь: кнопка берёт `encode`,
 * обработчик регистрируется по `pattern` и читает параметры через `parse`. Раньше одна и та
 * же строка была записана дважды (в кнопке и в регулярке обработчика), и правка одного
 * места без другого молча ломала кнопку.
 *
 * Telegram ограничивает callback_data 64 байтами: `encode` проверяет длину сразу, при
 * сборке клавиатуры, а не когда Telegram отклонит всё сообщение.
 */
export const CALLBACK_DATA_MAX_BYTES = 64

export type CallbackRoute<Params> = {
    /** Имя для логов и проверок. */
    readonly id: string
    /** По нему регистрируется обработчик (`bot.action(route.pattern, ...)`). */
    readonly pattern: RegExp
    /** Параметры → callback_data. */
    readonly encode: (params: Params) => string
    /** Результат совпадения `pattern` → параметры. */
    readonly decode: (match: RegExpMatchArray) => Params
    /** Параметры нажатой кнопки из контекста Telegraf (`ctx.match`). */
    readonly parse: (ctx: {match?: RegExpMatchArray | null}) => Params
}

type CallbackDefinition<Params> = {
    id: string
    pattern: RegExp
    encode: (params: Params) => string
    decode: (match: RegExpMatchArray) => Params
}

export const callbackDataBytes = (data: string): number =>
    Buffer.byteLength(data, 'utf8')

export const defineCallback = <Params = void>(
    definition: CallbackDefinition<Params>
): CallbackRoute<Params> => {
    const {id, pattern, encode, decode} = definition

    if (!pattern.source.startsWith('^') || !pattern.source.endsWith('$')) {
        // Без якорей шаблон одной кнопки мог бы перехватить данные другой.
        throw new Error(`[CALLBACK ${id}] pattern must be anchored with ^...$`)
    }

    return {
        id,
        pattern,

        encode: (params: Params) => {
            const data = encode(params)
            const bytes = callbackDataBytes(data)

            if (bytes > CALLBACK_DATA_MAX_BYTES) {
                throw new Error(
                    `[CALLBACK ${id}] callback_data is ${bytes} bytes, Telegram allows ${CALLBACK_DATA_MAX_BYTES}: ${data}`
                )
            }

            if (!pattern.test(data)) {
                // Кнопка, которую не поймает собственный обработчик, хуже ошибки при сборке.
                throw new Error(`[CALLBACK ${id}] encoded data does not match its own pattern: ${data}`)
            }

            return data
        },

        decode,

        parse: (ctx) => {
            const match = ctx.match

            if (!match) {
                throw new Error(`[CALLBACK ${id}] ctx.match is empty`)
            }

            return decode(match)
        }
    }
}

/** Кнопка без параметров: данные это просто строка. */
export const defineStaticCallback = (id: string, data: string): CallbackRoute<void> => {
    const escaped = data.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    return defineCallback<void>({
        id,
        pattern: new RegExp(`^${escaped}$`),
        encode: () => data,
        decode: () => undefined
    })
}

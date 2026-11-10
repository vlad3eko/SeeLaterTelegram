// Секрет для внутренних вызовов «бот -> наш же API».
//
// Файл намеренно изоморфный (только Web Crypto, без node-импортов): на него ссылаются модули,
// которые попадают и в клиентский бандл. В браузере process не определён, поэтому там
// getInternalSecret() вернёт null и заголовок просто не будет добавлен.
//
// Новых переменных окружения не нужно: секрет выводится (HMAC-SHA256) из серверного ключа Supabase,
// который уже есть и на Vercel, и в .env. Сам ключ наружу не выходит.
// Необязательное переопределение: INTERNAL_API_SECRET (если нужно, чтобы локальный бот ходил в прод
// с другим ключом Supabase — задайте одинаковое значение в обоих окружениях).

export const INTERNAL_HEADER = 'x-internal-auth'

const PURPOSE = 'kinomanov:internal-api:v1'

let cache: { source: string, secret: string } | null = null

const toHex = (buffer: ArrayBuffer): string =>
    Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')

const readSource = (): string | undefined => {
    if (typeof process === 'undefined' || !process.env) return undefined

    for (const name of [
        'INTERNAL_API_SECRET',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_SECRET_KEY',
        'SUPABASE_SERVICE_KEY',
    ]) {
        const value = process.env[name]?.trim()
        if (value) return value
    }

    return undefined
}

export const getInternalSecret = async (): Promise<string | null> => {
    const source = readSource()
    if (!source) return null

    if (cache?.source === source) return cache.secret

    const subtle = globalThis.crypto?.subtle
    if (!subtle) return null

    const encoder = new TextEncoder()
    const key = await subtle.importKey(
        'raw',
        encoder.encode(source),
        {name: 'HMAC', hash: 'SHA-256'},
        false,
        ['sign']
    )
    const secret = toHex(await subtle.sign('HMAC', key, encoder.encode(PURPOSE)))

    cache = {source, secret}
    return secret
}

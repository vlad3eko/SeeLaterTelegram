// Прокси для локальной разработки: туннель (cloudflared) смотрит сюда, а не на dev-сервер Nuxt.
// Наружу проходят только POST /api/bot/reelJobs/finalize (Reel готов или ждёт проверки) и
// /api/bot/trailerDelivery (готов трейлер для «Загрузки трейлера») — их вызывает воркер Cloud Run. Всё остальное (исходники Vite, webhook без проверки
// секрета в dev, служебные роуты) из интернета недоступно: ответ 404.
//
//   node scripts/devFinalizerProxy.mjs            порт 3001 -> http://127.0.0.1:3000
//   cloudflared tunnel --url http://127.0.0.1:3001
//
// Адрес туннеля (https://….trycloudflare.com) записать в .env как REEL_FINALIZER_BASE_URL
// и перезапустить npm run dev.

import http from 'node:http'

const LISTEN_PORT = Number(process.env.DEV_PROXY_PORT || 3001)
const TARGET = process.env.DEV_PROXY_TARGET || 'http://127.0.0.1:3000'
const ALLOWED_PATHS = new Set(['/api/bot/reeljobs/finalize', '/api/bot/trailerdelivery'])
const MAX_BODY_BYTES = 64 * 1024

const server = http.createServer((request, response) => {
    // Исходный регистр — для пересылки (роуты Nitro его различают), нижний — для сверки.
    const rawPath = (request.url ?? '').split('?')[0].replace(/\/+$/, '')
    const path = rawPath.toLowerCase()

    if (request.method !== 'POST' || !ALLOWED_PATHS.has(path)) {
        response.writeHead(404).end()
        return
    }

    const chunks = []
    let size = 0

    request.on('data', chunk => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
            response.writeHead(413).end()
            request.destroy()
            return
        }
        chunks.push(chunk)
    })

    request.on('end', async () => {
        if (response.writableEnded) return
        try {
            const upstream = await fetch(`${TARGET}${rawPath}`, {
                method: 'POST',
                headers: {'content-type': request.headers['content-type'] ?? 'application/json'},
                body: Buffer.concat(chunks)
            })
            const body = Buffer.from(await upstream.arrayBuffer())
            response.writeHead(upstream.status, {'content-type': upstream.headers.get('content-type') ?? 'application/json'})
            response.end(body)
            console.log('[DEV FINALIZER PROXY]', upstream.status)
        } catch (error) {
            console.error('[DEV FINALIZER PROXY] dev server is not reachable:', error?.message ?? error)
            response.writeHead(502).end()
        }
    })
})

server.listen(LISTEN_PORT, '127.0.0.1', () => {
    console.log(`[DEV FINALIZER PROXY] 127.0.0.1:${LISTEN_PORT} -> ${TARGET} (only POST ${[...ALLOWED_PATHS].join(', ')})`)
})

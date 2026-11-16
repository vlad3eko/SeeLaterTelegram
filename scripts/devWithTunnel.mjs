// Локальная разработка одной командой: npm run dev:tunnel
//
// 1. Прокси финализатора (scripts/devFinalizerProxy.mjs) на 127.0.0.1:3001 — наружу только
//    POST /api/bot/reelJobs/finalize.
// 2. Быстрый туннель cloudflared на этот прокси (бесплатно, без аккаунта; адрес новый при
//    каждом запуске).
// 3. nuxt dev с REEL_FINALIZER_BASE_URL = адрес туннеля: воркер Cloud Run сможет сообщить,
//    что Reel готов или ждёт проверки. Тестовый бот работает через polling, webhook не нужен.
//
// Ctrl-C останавливает всё. Нужен cloudflared в PATH (winget install Cloudflare.cloudflared).

import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import path from 'node:path'

const root = process.cwd()

// Терминал, открытый до установки cloudflared, не видит его в PATH: берём путь установки winget.
const cloudflaredBinary = process.env.CLOUDFLARED_PATH?.trim() || [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe'
].find(candidate => process.platform === 'win32' && existsSync(candidate)) || 'cloudflared'
const children = []

const stopAll = (code = 0) => {
    for (const child of children) {
        if (!child.killed) child.kill()
    }
    process.exit(code)
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

const run = (command, args, options = {}) => {
    const child = spawn(command, args, {cwd: root, ...options})
    children.push(child)
    child.on('exit', code => {
        console.log(`[DEV TUNNEL] ${path.basename(command)} exited (${code ?? 'signal'})`)
        stopAll(code ?? 1)
    })
    return child
}

run(process.execPath, [path.join(root, 'scripts', 'devFinalizerProxy.mjs')], {stdio: 'inherit'})

const tunnelUrl = await new Promise((resolve, reject) => {
    const tunnel = run(cloudflaredBinary, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:3001'], {
        stdio: ['ignore', 'ignore', 'pipe']
    })
    const timer = setTimeout(() => reject(new Error('cloudflared did not report a tunnel URL in 60 s')), 60_000)

    tunnel.on('error', error => {
        clearTimeout(timer)
        reject(new Error(`cloudflared is not available: ${error.message}`))
    })
    tunnel.stderr.on('data', chunk => {
        const match = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
        if (match) {
            clearTimeout(timer)
            resolve(match[0])
        }
    })
}).catch(error => {
    console.error('[DEV TUNNEL]', error.message)
    stopAll(1)
})

console.log(`[DEV TUNNEL] Finalizer URL for the Cloud Run worker: ${tunnelUrl}/api/bot/reelJobs/finalize`)

run(process.execPath, [path.join(root, 'node_modules', 'nuxt', 'bin', 'nuxt.mjs'), 'dev', '--host', '127.0.0.1'], {
    stdio: 'inherit',
    env: {...process.env, REEL_FINALIZER_BASE_URL: tunnelUrl}
})

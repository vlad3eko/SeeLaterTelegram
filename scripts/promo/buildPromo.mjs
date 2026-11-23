// Промо-истории Instagram и Reels из сценария scripts/promo/scenarios/<имя>.js на движке scripts/promo/engine.html.
//
//   node scripts/promo/buildPromo.mjs --scenario save                    истории + Reel + значок
//   node scripts/promo/buildPromo.mjs --scenario save --sheet            лист проверки: один PNG со всеми ключевыми кадрами
//   node scripts/promo/buildPromo.mjs --scenario save --preview comment:3,reel:20   отдельные кадры в PNG
//   ... --only comment,reel   только эти (ключи слайдов, reel, icon);  --jobs 3   сколько Chrome параллельно
//
// Результат — promo-out/<сценарий>/: story-<n>-<ключ>.mp4 (по PROMO.stories), reel.mp4 (PROMO.reel),
// highlight-icon.png (слайд icon), sheet.png, preview-*.png. Видео 1080×1920, 30 к/с, H.264 + тихая дорожка AAC.
// Фильмы сценария с {media, id} дополняются из TMDB через публичный роут сайта /api/tmdb/media (ключей не нужно).
// Как обложки /g (scripts/covers/buildCovers.mjs): Chrome без окна по DevTools, ffmpeg; новых зависимостей нет.
// Справка по сценариям — .claude/skills/promo-stories/SKILL.md.

import {execFile, spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {mkdir, rm, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {promisify} from 'node:util'

const run = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const ENGINE = path.join(here, 'engine.html')
const args = process.argv.slice(2)
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback }
const flag = name => args.includes(`--${name}`)
const SCENARIO = option('scenario', '')
if (!SCENARIO || !existsSync(path.join(here, 'scenarios', `${SCENARIO}.js`))) {
    console.error(`[PROMO] нужен --scenario <имя> из scripts/promo/scenarios (${SCENARIO || 'не задан'})`)
    process.exit(1)
}
const OUT = path.resolve(option('out', 'promo-out'), SCENARIO)
const PREVIEW = option('preview', '')
const JOBS = Math.max(1, Number(option('jobs', 3)))
const SITE = process.env.PROMO_SITE || 'https://kinomanov.net'
const FPS = 30
const SCALE = 2
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const findChrome = () => process.env.CHROME_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(candidate => existsSync(candidate)) || 'google-chrome'
const findFfmpeg = () => {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
    try { const bundled = createRequire(import.meta.url)('ffmpeg-static'); if (bundled && existsSync(bundled)) return bundled } catch {}
    return 'ffmpeg'
}

// Одна вкладка Chrome (свой профиль) на слайд: открыть движок, дождаться шрифтов, картинок и пометок.
let resolved = {films: {}, posters: []}
let pageNo = 0
const openPage = async (slide, width, height) => {
    const port = 9300 + Math.floor(Math.random() * 600)
    const profile = path.join(OUT, `chrome-profile-${pageNo++}`)
    const browser = spawn(findChrome(), ['--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : []), 'about:blank'], {stdio: 'ignore'})
    let target
    for (let i = 0; i < 60 && !target; i++) {
        await sleep(300)
        try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page') } catch {}
    }
    if (!target) { browser.kill(); throw new Error('Chrome DevTools not reachable') }
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject) })
    let nextId = 0
    const waiting = new Map()
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data)
        if (message.id && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id) }
    })
    const send = (method, params = {}) => new Promise(resolve => { const id = ++nextId; waiting.set(id, resolve); socket.send(JSON.stringify({id, method, params})) })
    const evaluate = async expression => {
        const reply = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true})
        if (reply.result?.exceptionDetails) throw new Error(`${slide}: ${reply.result.exceptionDetails.exception?.description ?? reply.result.exceptionDetails.text}`)
        return reply.result?.result?.value
    }
    const close = async () => { socket.close(); browser.kill(); await sleep(300); await rm(profile, {recursive: true, force: true}).catch(() => undefined) }
    await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: SCALE, mobile: false})
    await send('Page.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', {source: `window.PROMO_RESOLVED = ${JSON.stringify(resolved)}`})
    await send('Page.navigate', {url: `${pathToFileURL(ENGINE).href}#scenario=${SCENARIO}&slide=${slide}`})
    let ready = false
    for (let i = 0; i < 120 && !ready; i++) {
        await sleep(300)
        const error = await evaluate('window.promoError || ""').catch(() => '')
        if (error) { await close(); throw new Error(`${slide}: ${error}`) }
        ready = await evaluate('!!window.promoReady').catch(() => false)
    }
    if (!ready) { await close(); throw new Error(`Слайд не готов: ${slide} (нет такого ключа в slides() или ошибка в сценарии)`) }
    if (slide !== 'meta') await sleep(800)
    const shot = async (t, file, format = 'jpeg', scale = 1) => {
        await evaluate(`window.setTime(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`)
        const params = format === 'png' ? {format: 'png'} : {format: 'jpeg', quality: 93}
        if (scale !== 1) params.clip = {x: 0, y: 0, width, height, scale}
        const image = await send('Page.captureScreenshot', params)
        await writeFile(file, Buffer.from(image.result.data, 'base64'))
    }
    return {evaluate, shot, close}
}

// Фильмы с {media, id}: название, постер и кадр из TMDB (явные поля сценария важнее — их подставит движок).
const tmdb = async (media, id) => {
    const response = await fetch(`${SITE}/api/tmdb/media?media=${media}&id=${id}`)
    if (!response.ok) throw new Error(`TMDB ${media} ${id}: HTTP ${response.status}`)
    const data = await response.json()
    return {title: data.title || data.name, poster: data.poster_path, backdrop: data.backdrop_path,
        year: String(data.release_date || data.first_air_date || '').slice(0, 4)}
}
const resolveFilms = async meta => {
    for (const [key, spec] of Object.entries(meta.films)) {
        if (spec.media && spec.id) {
            resolved.films[key] = await tmdb(spec.media, spec.id)
            console.log(`[PROMO] фильм ${key}: ${resolved.films[key].title} (${resolved.films[key].year})`)
        }
    }
    resolved.posters = await Promise.all(meta.coverPosters.map(async item => typeof item === 'object' && item ? (await tmdb(item.media, item.id)).poster : null))
}

const storyName = (meta, slide) => `story-${meta.stories.indexOf(slide) + 1}-${slide}.mp4`

const renderVideo = async (meta, slide) => {
    const page = await openPage(slide, 540, 960)
    const framesDir = path.join(OUT, 'frames', slide)
    await mkdir(framesDir, {recursive: true})
    try {
        const duration = slide === 'reel' ? await page.evaluate('window.REEL_DURATION') : meta.durations[slide]
        const frames = Math.round(duration * FPS)
        for (let f = 0; f < frames; f++) {
            await page.shot(f / FPS, path.join(framesDir, `f${String(f).padStart(4, '0')}.jpg`))
            if (f % 90 === 0) console.log(`[PROMO] ${slide}: ${f}/${frames}`)
        }
    } finally { await page.close() }
    const video = path.join(OUT, slide === 'reel' ? 'reel.mp4' : storyName(meta, slide))
    // H.264 + тихая дорожка AAC: Instagram надёжнее принимает видео со звуковой дорожкой.
    await run(findFfmpeg(), ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(framesDir, 'f%04d.jpg'),
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest',
        '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', video],
        {timeout: 600_000})
    await rm(framesDir, {recursive: true, force: true})
    console.log(`[PROMO] готово: ${path.relative(process.cwd(), video)}`)
}

const renderIcon = async () => {
    const page = await openPage('icon', 540, 540)
    try { await page.shot(0, path.join(OUT, 'highlight-icon.png'), 'png') } finally { await page.close() }
    console.log(`[PROMO] готово: ${path.relative(process.cwd(), path.join(OUT, 'highlight-icon.png'))}`)
}

// Лист проверки: на каждый слайд — кадры, где каждая пометка уже нарисована, и последний кадр; всё в одном PNG
// (270×480 на кадр, 6 в ряд). Подписи кадров печатаются в консоль по порядку.
const renderSheet = async (meta, slides) => {
    const dir = path.join(OUT, 'sheet-frames')
    await mkdir(dir, {recursive: true})
    const labels = []
    for (const slide of slides) {
        const page = await openPage(slide, 540, 960)
        try {
            for (const t of meta.checks[slide]) {
                await page.shot(t, path.join(dir, `s${String(labels.length).padStart(3, '0')}.jpg`), 'jpeg', .5)
                labels.push(`${slide}@${t.toFixed(1)}`)
            }
        } finally { await page.close() }
    }
    const cols = Math.min(6, labels.length), rows = Math.ceil(labels.length / cols)
    await run(findFfmpeg(), ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, 's%03d.jpg'),
        '-vf', `scale=270:480,tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', path.join(OUT, 'sheet.png')])
    await rm(dir, {recursive: true, force: true})
    console.log(`[PROMO] лист проверки: ${path.relative(process.cwd(), path.join(OUT, 'sheet.png'))}`)
    labels.forEach((label, i) => console.log(`  ${i + 1}. ${label}`))
}

// Простой пул: не больше JOBS задач одновременно.
const pool = async (tasks, limit) => {
    const queue = [...tasks]
    const errors = []
    await Promise.all(Array.from({length: Math.min(limit, queue.length)}, async () => {
        while (queue.length) { const task = queue.shift(); await task().catch(error => { console.error('[PROMO] ошибка:', error.message); errors.push(error) }) }
    }))
    if (errors.length) process.exitCode = 1
}

await mkdir(OUT, {recursive: true})
const metaPage = await openPage('meta', 540, 960)
const meta = await metaPage.evaluate('window.promoMeta')
await metaPage.close()
await resolveFilms(meta)

const slideKeys = Object.keys(meta.durations).filter(key => key !== 'icon')
if (PREVIEW) {
    for (const item of PREVIEW.split(',')) {
        const [slide, t] = item.split(':')
        const page = await openPage(slide, 540, slide === 'icon' ? 540 : 960)
        try { await page.shot(Number(t || 0), path.join(OUT, `preview-${slide}-${t || 0}.png`), 'png', .5) } finally { await page.close() }
        console.log(`[PROMO] кадр: ${path.relative(process.cwd(), path.join(OUT, `preview-${slide}-${t || 0}.png`))}`)
    }
} else if (flag('sheet')) {
    const only = option('only', '')
    await renderSheet(meta, only ? only.split(',').filter(key => slideKeys.includes(key)) : slideKeys)
} else {
    const defaults = [...meta.stories, ...(meta.reel.length ? ['reel'] : []), ...(meta.icon ? ['icon'] : [])]
    const only = option('only', '') ? option('only', '').split(',') : defaults
    // Reel самый длинный — запускаем первым.
    const ordered = [...only].sort((a, b) => (b === 'reel') - (a === 'reel'))
    await pool(ordered.map(slide => slide === 'icon' ? renderIcon : () => renderVideo(meta, slide)), JOBS)
}
await rm(path.join(OUT, 'frames'), {recursive: true, force: true}).catch(() => undefined)

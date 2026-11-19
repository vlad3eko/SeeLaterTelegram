// Обложки экранов мастера подборок /g.
//
//   node --env-file=.env scripts/covers/buildCovers.mjs [--out dir] [--variants 3] [--screens home,root] [--publish]
//
// 1. Берёт из TMDB актуальные постеры под каждый экран (тренды, популярные сериалы, премьеры…).
// 2. Рисует шаблон scripts/covers/template.html в Chrome без окна: --variants вариантов на экран,
//    у каждого свой случайный наклон карточек.
// 3. Без --publish только сохраняет JPG и covers.json в --out (по умолчанию .covers-out).
//    С --publish отправляет каждую обложку в служебный Telegram-канал (TELEGRAM_MEDIA_STORAGE_CHAT_ID),
//    записывает file_id в таблицу collection_covers (database/migrations/collection_covers.sql)
//    и удаляет из неё прошлые партии.
//
// Новых зависимостей нет: Chrome (CHROME_PATH или стандартный путь), ffmpeg (FFMPEG_PATH,
// ffmpeg-static из node_modules или ffmpeg в PATH), fetch из Node 22.
// Запуск раз в квартал — .github/workflows/collection-covers.yml.

import {execFile} from 'node:child_process'
import {existsSync} from 'node:fs'
import {mkdir, readFile, stat, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {promisify} from 'node:util'

const run = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE = path.join(here, 'template.html')

// ---------- аргументы ----------
const args = process.argv.slice(2)
const flag = name => args.includes(`--${name}`)
const option = (name, fallback) => {
    const index = args.indexOf(`--${name}`)
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const OUT = path.resolve(option('out', '.covers-out'))
const VARIANTS = Math.max(1, Number(option('variants', 3)))
const PUBLISH = flag('publish')

// ---------- источники постеров ----------
// fresh — брать из первых строк (актуальное), иначе перемешивать первые 30 (чтобы раз в квартал
// «вечные» списки вроде топа по рейтингу тоже давали новые обложки). minVotes отсекает мыльные оперы
// и малоизвестные тайтлы; у премьер голосов ещё нет.
const year = new Date().getFullYear()
const SCREENS = {
    home: {fresh: true, minVotes: 100, sources: ['trending/all/week', 'trending/all/week?page=2']},
    root: {fresh: true, minVotes: 200, sources: ['movie/popular', 'movie/popular?page=2']},
    series: {fresh: true, minVotes: 300, sources: ['tv/popular', 'tv/popular?page=2', 'tv/on_the_air']},
    criterion: {fresh: false, minVotes: 1000, sources: ['movie/top_rated', 'movie/top_rated?page=2', 'tv/top_rated']},
    filter: {fresh: false, minVotes: 3000, sources: [
        `discover/movie?sort_by=vote_count.desc&primary_release_date.gte=${year - 12}-01-01`,
        `discover/movie?sort_by=vote_count.desc&primary_release_date.gte=${year - 12}-01-01&page=2`]},
    direction: {fresh: true, minVotes: 0, sources: ['movie/upcoming?region=US', 'movie/now_playing?region=US']},
    period: {fresh: true, minVotes: 300, sources: ['trending/movie/week', 'trending/movie/week?page=2', 'trending/tv/week']},
    // Связки — сюжетное кино: детективы, триллеры, фантастика с сильной историей.
    bundles: {fresh: false, minVotes: 3000, sources: [
        'discover/movie?sort_by=vote_count.desc&with_genres=9648|53&primary_release_date.gte=1995-01-01',
        'discover/movie?sort_by=vote_count.desc&with_genres=9648|53&primary_release_date.gte=1995-01-01&page=2']},
    loading: {fresh: false, minVotes: 5000, sources: [
        'discover/movie?sort_by=vote_count.desc&primary_release_date.gte=1985-01-01&primary_release_date.lte=2008-12-31',
        'discover/movie?sort_by=vote_count.desc&primary_release_date.gte=1985-01-01&primary_release_date.lte=2008-12-31&page=2']},
    // Страницы готовой подборки — одна обложка на все разделы.
    result: {fresh: false, minVotes: 2000, sources: ['movie/top_rated?page=3', 'tv/top_rated', 'movie/popular?page=3']}
}
const POSTERS_PER_SCREEN = 6
const onlyScreens = option('screens', '').split(',').filter(Boolean)
const screenKeys = Object.keys(SCREENS).filter(key => !onlyScreens.length || onlyScreens.includes(key))

const tmdb = async pathAndQuery => {
    const key = process.env.TMDB_API_KEY?.trim()
    if (!key) throw new Error('TMDB_API_KEY is missing')
    const url = `https://api.themoviedb.org/3/${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}language=ru-RU`
    for (let attempt = 0; attempt < 4; attempt++) {
        const response = await fetch(url, {headers: {accept: 'application/json', Authorization: `Bearer ${key}`}, signal: AbortSignal.timeout(20_000)})
        if (response.status === 429) { await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); continue }
        if (!response.ok) throw new Error(`TMDB ${response.status}: ${pathAndQuery.split('?')[0]}`)
        return response.json()
    }
    throw new Error(`TMDB 429: ${pathAndQuery.split('?')[0]}`)
}

// Подходит: есть постер, русское название (значит, есть и русский постер или хотя бы перевод),
// не взрослое, не русское и не индийское кино (как в подборках), достаточно голосов.
const suitable = (item, minVotes) =>
    item.poster_path && /^\/[A-Za-z0-9]+\.jpg$/.test(item.poster_path) && !item.adult &&
    /[а-яё]/i.test(item.title || item.name || '') &&
    !['ru', 'hi', 'ta', 'te', 'ml', 'kn'].includes(item.original_language) &&
    (item.vote_count ?? 0) >= minVotes &&
    (item.media_type ?? 'movie') !== 'person' &&
    // Не кино и не сериалы в обычном смысле: новости, реалити, мыльные оперы, ток-шоу (жанры TMDB).
    !(item.genre_ids ?? []).some(genre => [10763, 10764, 10766, 10767].includes(genre))

const shuffle = list => {
    const copy = [...list]
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
}

const pickPosters = async () => {
    const used = new Set()
    const picked = {}
    for (const key of screenKeys) {
        const {fresh, minVotes, sources} = SCREENS[key]
        const items = []
        for (const source of sources) items.push(...((await tmdb(source)).results ?? []))
        const seen = new Set()
        const candidates = items.filter(item => {
            const id = `${item.media_type ?? (item.title ? 'movie' : 'tv')}:${item.id}`
            if (seen.has(id) || !suitable(item, minVotes)) return false
            seen.add(id)
            item._key = id
            return true
        })
        // Актуальные — из первых 12 в случайном порядке, «вечные» — из первых 30.
        const pool = shuffle(candidates.slice(0, fresh ? 12 : 30)).concat(candidates.slice(fresh ? 12 : 30))
        // Сначала тайтлы, которых ещё нет на других экранах; если не хватило — повторы.
        const chosen = pool.filter(item => !used.has(item._key)).slice(0, POSTERS_PER_SCREEN)
        for (const item of pool) if (chosen.length < POSTERS_PER_SCREEN && !chosen.includes(item)) chosen.push(item)
        // Совсем мало (например, премьер с русским названием) — берём и тайтлы с меньшим числом голосов,
        // чтобы квартальный запуск не падал из-за одного экрана.
        if (chosen.length < POSTERS_PER_SCREEN) {
            for (const item of items) {
                if (chosen.length >= POSTERS_PER_SCREEN) break
                if (!suitable(item, 0) || chosen.some(other => other.poster_path === item.poster_path)) continue
                item._key = `${item.media_type ?? (item.title ? 'movie' : 'tv')}:${item.id}`
                chosen.push(item)
            }
        }
        if (chosen.length < POSTERS_PER_SCREEN) throw new Error(`Not enough posters for "${key}": ${chosen.length}`)
        chosen.forEach(item => used.add(item._key))
        picked[key] = chosen.map(item => ({path: item.poster_path.slice(1, -4), title: item.title || item.name}))
        console.log(`[COVERS] ${key}: ${picked[key].map(p => p.title).join(' · ')}`)
    }
    return picked
}

// ---------- отрисовка ----------
const findChrome = async () => {
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH
    const known = [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ].find(candidate => existsSync(candidate))
    if (known) return known
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
        try { await run('which', [name]); return name } catch {}
    }
    throw new Error('Chrome not found: set CHROME_PATH')
}

const findFfmpeg = () => {
    if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
    try {
        const bundled = createRequire(import.meta.url)('ffmpeg-static')
        if (bundled && existsSync(bundled)) return bundled
    } catch {}
    return 'ffmpeg'
}

const render = async (chrome, ffmpeg, screen, posters, variant) => {
    const seed = Math.floor(Math.random() * 1e9)
    const png = path.join(OUT, 'png', `${screen}-${variant}.png`)
    const jpg = path.join(OUT, `${screen}-${variant}.jpg`)
    const url = `${pathToFileURL(TEMPLATE).href}#screen=${screen}&posters=${posters.map(p => p.path).join(',')}&seed=${seed}`
    await run(chrome, [
        '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=2',
        // Ждём шрифт, постеры и цвета боков карточек (canvas) — сеть, поэтому с запасом.
        '--virtual-time-budget=20000', '--window-size=1280,853',
        ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
        `--screenshot=${png}`, url
    ], {timeout: 120_000})
    if (!existsSync(png) || (await stat(png)).size < 200_000) throw new Error(`Screenshot failed: ${screen} #${variant}`)
    // Telegram всё равно ужимает фото до 1280 по длинной стороне; 1920 — с запасом на чёткость.
    await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', png, '-vf', 'scale=1920:-1:flags=lanczos', '-q:v', '3', jpg], {timeout: 60_000})
    return {screen, variant, seed, file: path.basename(jpg), posters: posters.map(p => p.path)}
}

// ---------- публикация ----------
const requireEnv = name => {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`${name} is missing`)
    return value
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// TELEGRAM_API_URL — только для проверки на локальной заглушке; по умолчанию настоящий Bot API.
const TELEGRAM_API = (process.env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(/\/$/, '')

// file_id в Telegram принадлежит боту, который загрузил файл: чужие file_id бот показывать не обязан
// (19.11.2026 тестовый бот перестал принимать обложки боевого). Поэтому каждая обложка загружается
// от имени каждого бота: prod — TELEGRAM_TOKEN, dev — TELEGRAM_DEV_TOKEN, если он задан.
const botsToPublish = () => [
    {bot: 'prod', token: requireEnv('TELEGRAM_TOKEN')},
    ...(process.env.TELEGRAM_DEV_TOKEN?.trim() ? [{bot: 'dev', token: process.env.TELEGRAM_DEV_TOKEN.trim()}] : [])
]

// В канал Telegram пускает ~20 сообщений в минуту: между отправками пауза, на 429 — ждём сколько
// велено (retry_after), на сбой сети или 5xx — повтор. Всего до 6 попыток на обложку.
const sendToStorage = async (photo, cover, batch, token) => {
    for (let attempt = 1; ; attempt++) {
        const form = new FormData()
        form.append('chat_id', requireEnv('TELEGRAM_MEDIA_STORAGE_CHAT_ID'))
        form.append('caption', `Обложка /g · ${cover.screen} #${cover.variant} · ${batch}`)
        form.append('disable_notification', 'true')
        form.append('photo', new Blob([photo], {type: 'image/jpeg'}), `${cover.screen}-${cover.variant}.jpg`)
        let body = null
        let retryAfter = 5 * attempt
        try {
            const response = await fetch(`${TELEGRAM_API}/bot${token}/sendPhoto`,
                {method: 'POST', body: form, signal: AbortSignal.timeout(60_000)})
            body = await response.json().catch(() => ({ok: false, error_code: response.status, description: `HTTP ${response.status}`}))
        } catch (error) {
            body = {ok: false, error_code: 0, description: error instanceof Error ? error.message : String(error)}
        }
        if (body.ok) return body.result.photo.at(-1).file_id
        const retryable = body.error_code === 429 || body.error_code === 0 || body.error_code >= 500
        if (!retryable || attempt >= 6) {
            throw new Error(`Telegram sendPhoto failed (${cover.screen} #${cover.variant}): ${body.description}`)
        }
        if (body.error_code === 429) retryAfter = (body.parameters?.retry_after ?? 30) + 1
        console.warn(`[COVERS] Telegram: ${body.description} — retry in ${retryAfter}s`)
        await sleep(retryAfter * 1000)
    }
}

/** Скачать файл по file_id от имени бота-владельца. */
const downloadFile = async (fileId, token) => {
    const info = await (await fetch(`${TELEGRAM_API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`)).json()
    if (!info.ok) throw new Error(`Telegram getFile failed: ${info.description}`)
    const response = await fetch(`${TELEGRAM_API}/file/bot${token}/${info.result.file_path}`, {signal: AbortSignal.timeout(60_000)})
    if (!response.ok) throw new Error(`Telegram file download ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
}

const supabase = async (method, query, body) => {
    const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    const response = await fetch(`${requireEnv('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/collection_covers${query}`, {
        method,
        // Новые секретные ключи (sb_secret_…) идут только в apikey, старые JWT — ещё и в Authorization.
        headers: {apikey: key, ...(key.startsWith('sb_') ? {} : {Authorization: `Bearer ${key}`}),
            'content-type': 'application/json', Prefer: 'return=minimal'},
        ...(body ? {body: JSON.stringify(body)} : {})
    })
    if (!response.ok) throw new Error(`Supabase ${method} collection_covers ${response.status}: ${await response.text()}`)
    return method === 'GET' ? response.json() : undefined
}

const sendDelay = () => sleep(Number(process.env.COVERS_SEND_DELAY_MS ?? 3500))

/**
 * --mirror-dev: без отрисовки — текущие обложки боевого бота загрузить ещё и от имени тестового
 * (TELEGRAM_DEV_TOKEN) и заменить ими строки bot = dev.
 */
const mirrorDev = async () => {
    const prodToken = requireEnv('TELEGRAM_TOKEN')
    const devToken = requireEnv('TELEGRAM_DEV_TOKEN')
    const rows = await supabase('GET', '?select=batch,screen,variant,file_id,posters,seed&bot=eq.prod&order=screen,variant')
    if (!rows.length) throw new Error('No prod covers to mirror')
    const mirrored = []
    for (const [index, row] of rows.entries()) {
        if (index) await sendDelay()
        const photo = await downloadFile(row.file_id, prodToken)
        mirrored.push({...row, bot: 'dev', file_id: await sendToStorage(photo, row, row.batch, devToken)})
        console.log(`[COVERS] mirrored ${row.screen} #${row.variant}`)
    }
    await supabase('DELETE', '?bot=eq.dev')
    await supabase('POST', '', mirrored)
    console.log(`[COVERS] dev covers: ${mirrored.length}`)
}

// ---------- запуск ----------
const main = async () => {
    if (flag('mirror-dev')) return mirrorDev()

    await mkdir(path.join(OUT, 'png'), {recursive: true})
    const chrome = await findChrome()
    const ffmpeg = findFfmpeg()
    const posters = await pickPosters()

    const covers = []
    for (const screen of screenKeys) {
        for (let variant = 1; variant <= VARIANTS; variant++) {
            covers.push(await render(chrome, ffmpeg, screen, posters[screen], variant))
            console.log(`[COVERS] rendered ${screen} #${variant}`)
        }
    }

    const batch = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
    if (PUBLISH) {
        const bots = botsToPublish()
        const rows = []
        let sent = 0
        for (const cover of covers) {
            const photo = await readFile(path.join(OUT, cover.file))
            for (const {bot, token} of bots) {
                if (sent++) await sendDelay()
                rows.push({batch, bot, screen: cover.screen, variant: cover.variant,
                    file_id: await sendToStorage(photo, cover, batch, token), posters: cover.posters, seed: cover.seed})
                console.log(`[COVERS] sent ${cover.screen} #${cover.variant} (${bot})`)
            }
        }
        await supabase('POST', '', rows)
        // Новая партия записана — прошлые больше не нужны: только у ботов этой партии
        // (без TELEGRAM_DEV_TOKEN обложки тестового бота остаются) и при --screens — только по этим экранам.
        const botNames = bots.map(({bot}) => bot).join(',')
        const screensFilter = onlyScreens.length ? `&screen=in.(${screenKeys.join(',')})` : ''
        await supabase('DELETE', `?batch=neq.${batch}&bot=in.(${botNames})${screensFilter}`)
        console.log(`[COVERS] published batch ${batch}: ${covers.length} covers × ${botNames}`)
    }

    await writeFile(path.join(OUT, 'covers.json'), JSON.stringify({batch, published: PUBLISH, posters, covers}, null, 2))
    console.log(`[COVERS] done: ${covers.length} covers in ${OUT}`)
}

main().catch(error => {
    console.error('[COVERS] failed:', error instanceof Error ? error.message : error)
    process.exit(1)
})

// Обложки экранов мастера подборок /g — по одной GIF на экран.
//
//   node --env-file=.env scripts/covers/buildCovers.mjs [--out dir] [--screens home,root] [--publish]
//
// 1. Берёт из TMDB актуальные постеры (у экранов «Актёры и режиссёры» — портреты) под каждый экран.
// 2. Рисует шаблон scripts/covers/template.html в Chrome без окна и снимает 48 кадров: карточки
//    покачиваются, по заголовку бежит волна; ffmpeg собирает зацикленную GIF 800 px (~3,5 МБ).
// 3. Без --publish только сохраняет GIF и covers.json в --out (по умолчанию .covers-out).
//    С --publish отправляет каждую GIF в служебный Telegram-канал (TELEGRAM_MEDIA_STORAGE_CHAT_ID)
//    от имени обоих ботов — боевого и тестового, записывает file_id в таблицу collection_covers
//    и удаляет из неё прошлые партии этих экранов. Один запуск обновляет оба бота сразу.
//
// Новых зависимостей нет: Chrome (CHROME_PATH или стандартный путь), ffmpeg (FFMPEG_PATH,
// ffmpeg-static из node_modules или ffmpeg в PATH), fetch и WebSocket из Node 22.
// Запуск раз в квартал — .github/workflows/collection-covers.yml.

import {execFile, spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
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
const PUBLISH = flag('publish')
// GIF: 48 кадров по 12 в секунду — цикл 4 секунды; ширина 800 px — около 3,5 МБ на экран.
const GIF_FRAMES = 48
const GIF_FPS = 12
const GIF_WIDTH = 800

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
    result: {fresh: false, minVotes: 2000, sources: ['movie/top_rated?page=3', 'tv/top_rated', 'movie/popular?page=3']},
    // Аниме и дунхуа: фильмы или сериалы — японская анимация.
    format: {fresh: false, minVotes: 1000, sources: [
        'discover/tv?with_genres=16&with_original_language=ja&sort_by=vote_count.desc',
        'discover/movie?with_genres=16&with_original_language=ja&sort_by=vote_count.desc']},
    // «🎭 Актёры и режиссёры» — портреты людей (profile_path TMDB) вместо постеров.
    // ids — постоянные лица; popular — популярные сейчас актёры (person/popular). Актёры и режиссёры:
    // Нолан, Ди Каприо, Спилберг, Фостер, Тарантино, Питт.
    people: {people: true, fresh: false, ids: [525, 6193, 488, 1038, 138, 287]},
    // Живые или ушедшие: три легенды, ушедшие с 2015 года (Рикман, Боузман, Коннери), и три живые (Хопкинс, Де Ниро, Пачино).
    peopleLife: {people: true, fresh: false, ids: [4566, 172069, 738, 4173, 380, 1158]},
    peopleSearch: {people: true, fresh: true, popular: true},
    birthdays: {people: true, fresh: true, popular: true}
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

// Известный актёр или режиссёр: есть портрет, не 18+, и среди «известен по» — тайтл
// с 12 тысячами голосов и больше не из исключённых стран (как в подборках).
const famousPerson = person =>
    person.profile_path && /^\/[A-Za-z0-9]+\.jpg$/.test(person.profile_path) && !person.adult &&
    ['Acting', 'Directing'].includes(person.known_for_department) &&
    (person.known_for ?? []).some(title => (title.vote_count ?? 0) >= 12000 && !['ru', 'hi', 'ta', 'te', 'ml', 'kn', 'ko'].includes(title.original_language))

const popularPeople = async () => {
    const pages = await Promise.all([1, 2, 3].map(page => tmdb(`person/popular?page=${page}`)))
    return pages.flatMap(page => page.results ?? []).filter(famousPerson)
}

const pickPeople = async (key, used) => {
    const {fresh, ids = [], popular} = SCREENS[key]
    const fixed = []
    for (const id of ids) {
        const person = await tmdb(`person/${id}`)
        if (person.profile_path) fixed.push({...person, _key: `person:${id}`})
    }
    const live = popular ? (await popularPeople()).map(person => ({...person, _key: `person:${person.id}`})) : []
    const pool = [...shuffle(fixed), ...shuffle(live.slice(0, fresh ? 15 : 30))]
    const chosen = pool.filter(person => !used.has(person._key)).slice(0, POSTERS_PER_SCREEN)
    for (const person of pool) if (chosen.length < POSTERS_PER_SCREEN && !chosen.includes(person)) chosen.push(person)
    if (chosen.length < POSTERS_PER_SCREEN) throw new Error(`Not enough portraits for "${key}": ${chosen.length}`)
    return chosen.map(person => ({...person, poster_path: person.profile_path, title: person.name}))
}

const pickPosters = async () => {
    const used = new Set()
    const picked = {}
    for (const key of screenKeys) {
        if (SCREENS[key].people) {
            const chosen = await pickPeople(key, used)
            chosen.forEach(person => used.add(person._key))
            picked[key] = chosen.map(person => ({path: person.poster_path.slice(1, -4), title: person.title}))
            console.log(`[COVERS] ${key}: ${picked[key].map(p => p.title).join(' · ')}`)
            continue
        }
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

// Chrome без окна по протоколу DevTools (WebSocket из Node 22, без новых зависимостей).
// Шаблон рисуется один раз, затем для каждого кадра — setPhase(0…1) и снимок; ffmpeg собирает GIF.
// seed — случайный наклон карточек (повторить: #seed=… в адресе шаблона).
const render = async (chrome, ffmpeg, screen, posters) => {
    const seed = Math.floor(Math.random() * 1e9)
    const framesDir = path.join(OUT, 'frames', screen)
    const gif = path.join(OUT, `${screen}-1.gif`)
    await mkdir(framesDir, {recursive: true})
    const port = 9300 + Math.floor(Math.random() * 600)
    const browser = spawn(chrome, [
        '--headless=new', '--hide-scrollbars', `--remote-debugging-port=${port}`,
        `--user-data-dir=${path.join(OUT, 'chrome-profile')}`,
        ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
        'about:blank'
    ], {stdio: 'ignore'})
    try {
        let target
        for (let i = 0; i < 60 && !target; i++) {
            await sleep(300)
            try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page') } catch {}
        }
        if (!target) throw new Error(`Chrome DevTools not reachable: ${screen}`)
        const socket = new WebSocket(target.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject) })
        let nextId = 0
        const waiting = new Map()
        socket.addEventListener('message', event => {
            const message = JSON.parse(event.data)
            if (message.id && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id) }
        })
        const send = (method, params = {}) => new Promise(resolve => {
            const id = ++nextId
            waiting.set(id, resolve)
            socket.send(JSON.stringify({id, method, params}))
        })
        const evaluate = async expression =>
            (await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true})).result?.result?.value

        await send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 853, deviceScaleFactor: 1.5, mobile: false})
        await send('Page.navigate', {url: `${pathToFileURL(TEMPLATE).href}#screen=${screen}&posters=${posters.map(p => p.path).join(',')}&seed=${seed}`})
        let ready = false
        for (let i = 0; i < 100 && !ready; i++) {
            await sleep(300)
            ready = await evaluate(`!!window.coverReady && document.fonts.status === 'loaded' && [...document.images].every(image => image.complete) && !!document.querySelector('#title svg')`)
        }
        if (!ready) throw new Error(`Template not ready: ${screen}`)
        await sleep(1000)
        for (let frame = 0; frame < GIF_FRAMES; frame++) {
            await evaluate(`window.setPhase(${frame / GIF_FRAMES}); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
            const shot = await send('Page.captureScreenshot', {format: 'png'})
            await writeFile(path.join(framesDir, `f${String(frame).padStart(3, '0')}.png`), Buffer.from(shot.result.data, 'base64'))
        }
        socket.close()
    } finally {
        browser.kill()
    }
    // Палитра по разнице кадров и сетчатый дизеринг: градиенты фона без полос, файл ~3,5 МБ.
    await run(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(GIF_FPS), '-i', path.join(framesDir, 'f%03d.png'),
        '-vf', `scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
        '-loop', '0', gif], {timeout: 180_000})
    await rm(framesDir, {recursive: true, force: true})
    return {screen, variant: 1, seed, file: path.basename(gif), posters: posters.map(p => p.path)}
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
// от имени обоих ботов сразу — prod (TELEGRAM_TOKEN) и dev (TELEGRAM_DEV_TOKEN): обновили экран —
// обновился у обоих. Нет любого из токенов — запуск падает до отрисовки, чтобы боты не разошлись.
const botsToPublish = () => [
    {bot: 'prod', token: requireEnv('TELEGRAM_TOKEN')},
    {bot: 'dev', token: requireEnv('TELEGRAM_DEV_TOKEN')}
]

// В канал Telegram пускает ~20 сообщений в минуту: между отправками пауза, на 429 — ждём сколько
// велено (retry_after), на сбой сети или 5xx — повтор. Всего до 6 попыток на обложку.
// GIF уходит через sendAnimation: Telegram показывает её как GIF — сама проигрывается по кругу
// у всех, независимо от настройки автовоспроизведения видео.
const sendToStorage = async (gif, cover, batch, token) => {
    for (let attempt = 1; ; attempt++) {
        const form = new FormData()
        form.append('chat_id', requireEnv('TELEGRAM_MEDIA_STORAGE_CHAT_ID'))
        form.append('caption', `Обложка /g · ${cover.screen} · ${batch}`)
        form.append('disable_notification', 'true')
        form.append('animation', new Blob([gif], {type: 'image/gif'}), `${cover.screen}.gif`)
        let body = null
        let retryAfter = 5 * attempt
        try {
            const response = await fetch(`${TELEGRAM_API}/bot${token}/sendAnimation`,
                {method: 'POST', body: form, signal: AbortSignal.timeout(60_000)})
            body = await response.json().catch(() => ({ok: false, error_code: response.status, description: `HTTP ${response.status}`}))
        } catch (error) {
            body = {ok: false, error_code: 0, description: error instanceof Error ? error.message : String(error)}
        }
        if (body.ok) return (body.result.animation ?? body.result.document).file_id
        const retryable = body.error_code === 429 || body.error_code === 0 || body.error_code >= 500
        if (!retryable || attempt >= 6) {
            throw new Error(`Telegram sendAnimation failed (${cover.screen}): ${body.description}`)
        }
        if (body.error_code === 429) retryAfter = (body.parameters?.retry_after ?? 30) + 1
        console.warn(`[COVERS] Telegram: ${body.description} — retry in ${retryAfter}s`)
        await sleep(retryAfter * 1000)
    }
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

// ---------- запуск ----------
const main = async () => {
    // Токены проверяем до отрисовки (она идёт ~20 минут), а не после.
    const bots = PUBLISH ? botsToPublish() : []
    await mkdir(OUT, {recursive: true})
    const chrome = await findChrome()
    const ffmpeg = findFfmpeg()
    const posters = await pickPosters()

    const covers = []
    for (const screen of screenKeys) {
        covers.push(await render(chrome, ffmpeg, screen, posters[screen]))
        console.log(`[COVERS] rendered ${screen}`)
    }

    const batch = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
    if (PUBLISH) {
        const rows = []
        let sent = 0
        for (const cover of covers) {
            const gif = await readFile(path.join(OUT, cover.file))
            for (const {bot, token} of bots) {
                if (sent++) await sendDelay()
                rows.push({batch, bot, screen: cover.screen, variant: cover.variant,
                    file_id: await sendToStorage(gif, cover, batch, token), posters: cover.posters, seed: cover.seed})
                console.log(`[COVERS] sent ${cover.screen} (${bot})`)
            }
        }
        await supabase('POST', '', rows)
        // Новая партия записана у обоих ботов — прошлые больше не нужны (при --screens — только по этим экранам).
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

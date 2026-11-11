/**
 * Ставит yt-dlp для локальных запусков на Windows и macOS (сухой прогон публикации Reel).
 * На Linux ничего не делает: там работает media-tools/yt-dlp, который кладёт prepareMediaTools.mjs.
 *
 *   npm run reel:setup-ytdlp
 *
 * Что происходит:
 *   1. Скачивается официальный бинарник yt-dlp той же версии, что и в боевой сборке
 *      (scripts/prepareMediaTools.mjs), и проверяется по SHA2-256SUMS из того же релиза.
 *   2. Файл кладётся в tmp/tools/ (папка в .gitignore, в репозиторий не попадёт).
 *   3. Плагин BGUtil из bgutil-ytdlp-pot-provider/plugin копируется рядом с бинарником
 *      (tmp/tools/yt-dlp-plugins/bgutil-ytdlp-pot-provider), как это делает боевая сборка:
 *      без плагина YouTube часто не отдаёт видео.
 *   4. Бинарник запускается с --version для проверки.
 *
 * Сухой прогон сам находит tmp/tools/yt-dlp(.exe). Переменная YTDLP_PATH не нужна.
 * YTDLP_DOWNLOAD_BASE (необязательно): другой адрес папки релиза, например зеркало.
 */
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {access, chmod, cp, mkdir, rename, rm, stat, writeFile, readFile} from 'node:fs/promises'
import path from 'node:path'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

// Держать равной версии в scripts/prepareMediaTools.mjs.
const YTDLP_VERSION = '2026.10.26'

const downloadBase = (
    process.env.YTDLP_DOWNLOAD_BASE?.trim() ||
    `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}`
).replace(/\/+$/, '')

const root = process.cwd()
const toolsDirectory = path.join(root, 'tmp', 'tools')

const exists = async (filePath) => {
    try {
        await access(filePath)
        return true
    } catch {
        return false
    }
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

const fetchBuffer = async (url) => {
    const response = await fetch(url, {redirect: 'follow'})

    if (!response.ok) {
        throw new Error(`[YTDLP SETUP] Download failed: HTTP ${response.status} for ${url}`)
    }

    return Buffer.from(await response.arrayBuffer())
}

const pickAsset = () => {
    if (process.platform === 'win32' && process.arch === 'x64') {
        return {asset: 'yt-dlp.exe', binary: 'yt-dlp.exe'}
    }

    if (process.platform === 'darwin') {
        return {asset: 'yt-dlp_macos', binary: 'yt-dlp'}
    }

    return undefined
}

const main = async () => {
    if (process.platform === 'linux') {
        console.log('[YTDLP SETUP] Linux: media-tools/yt-dlp from prepareMediaTools.mjs is used, nothing to install.')
        return
    }

    const picked = pickAsset()

    if (!picked) {
        throw new Error(
            `[YTDLP SETUP] No prepared yt-dlp build for ${process.platform}/${process.arch}. ` +
            'Install yt-dlp yourself and set YTDLP_PATH in .env.'
        )
    }

    const pluginSource = path.join(root, 'bgutil-ytdlp-pot-provider', 'plugin')

    if (!(await exists(path.join(pluginSource, 'yt_dlp_plugins')))) {
        throw new Error(
            `[YTDLP SETUP] BGUtil plugin not found: ${pluginSource}. Run this command from the project root.`
        )
    }

    await mkdir(toolsDirectory, {recursive: true})

    const binaryPath = path.join(toolsDirectory, picked.binary)

    const sums = (await fetchBuffer(`${downloadBase}/SHA2-256SUMS`)).toString('utf8')
    const expectedLine = sums
        .split(/\r?\n/)
        .map((line) => line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i))
        .find((match) => match && match[2] === picked.asset)
    const expectedHash = expectedLine?.[1]?.toLowerCase()

    if (!expectedHash) {
        throw new Error(`[YTDLP SETUP] ${picked.asset} not found in SHA2-256SUMS of release ${YTDLP_VERSION}`)
    }

    let installed = false

    if (await exists(binaryPath)) {
        installed = sha256(await readFile(binaryPath)) === expectedHash
    }

    if (installed) {
        console.log('[YTDLP SETUP] Binary is already installed and matches the release checksum:', binaryPath)
    } else {
        console.log(`[YTDLP SETUP] Downloading ${picked.asset} ${YTDLP_VERSION} ...`)

        const buffer = await fetchBuffer(`${downloadBase}/${picked.asset}`)
        const actualHash = sha256(buffer)

        if (actualHash !== expectedHash) {
            throw new Error(
                `[YTDLP SETUP] Checksum mismatch for ${picked.asset}: expected ${expectedHash}, got ${actualHash}. File was not saved.`
            )
        }

        const partPath = `${binaryPath}.part`
        await writeFile(partPath, buffer)
        await rm(binaryPath, {force: true})
        await rename(partPath, binaryPath)

        console.log('[YTDLP SETUP] Installed:', binaryPath, `(${(await stat(binaryPath)).size} bytes, checksum OK)`)
    }

    if (process.platform !== 'win32') {
        await chmod(binaryPath, 0o755)
    }

    const pluginTarget = path.join(toolsDirectory, 'yt-dlp-plugins', 'bgutil-ytdlp-pot-provider')
    await rm(pluginTarget, {recursive: true, force: true})
    await mkdir(path.dirname(pluginTarget), {recursive: true})
    await cp(pluginSource, pluginTarget, {recursive: true})

    console.log('[YTDLP SETUP] BGUtil plugin copied:', pluginTarget)

    const {stdout} = await execFileAsync(binaryPath, ['--version'])
    const version = stdout.trim()

    console.log('[YTDLP SETUP] yt-dlp version:', version)

    if (version !== YTDLP_VERSION) {
        console.warn(`[YTDLP SETUP] Expected version ${YTDLP_VERSION}, binary reports ${version}.`)
    }

    console.log('[YTDLP SETUP] Done. Now run: npm run reel:dryrun -- --key <id> --title "..." ')
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})

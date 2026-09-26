import {mkdir, chmod} from 'node:fs/promises'
import {createWriteStream} from 'node:fs'
import {pipeline} from 'node:stream/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import https from 'node:https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const targetDir = path.join(root, 'node_modules', '.bin')
const targetPath = path.join(targetDir, 'yt-dlp-linux')

const url =
	'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux'

if (process.platform !== 'linux') {
	console.log('[YTDLP] Skip Linux binary on', process.platform)
	process.exit(0)
}

await mkdir(targetDir, {
	recursive: true
})

console.log('[YTDLP] Downloading official Linux binary...')

await new Promise((resolve, reject) => {
	https.get(url, response => {
		if (
			response.statusCode >= 300 &&
			response.statusCode < 400 &&
			response.headers.location
		) {
			https.get(response.headers.location, async redirect => {
				await pipeline(
					redirect,
					createWriteStream(targetPath)
				)
				resolve()
			}).on('error', reject)

			return
		}

		if (response.statusCode !== 200) {
			reject(
				new Error(
					`yt-dlp download failed: ${response.statusCode}`
				)
			)
			return
		}

		pipeline(
			response,
			createWriteStream(targetPath)
		).then(resolve).catch(reject)
	}).on('error', reject)
})

await chmod(targetPath, 0o755)

console.log(
	'[YTDLP] Linux binary installed:',
	targetPath
)

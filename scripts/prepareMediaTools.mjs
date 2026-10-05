import {mkdir, chmod, access, stat} from 'node:fs/promises'
import {createWriteStream} from 'node:fs'
import {pipeline} from 'node:stream/promises'
import path from 'node:path'
import https from 'node:https'
import {fileURLToPath} from 'node:url'


const __dirname =
	path.dirname(fileURLToPath(import.meta.url))

const rootDir =
	path.resolve(__dirname, '..')

const ytDlpPath =
	path.join(rootDir, 'media-tools', 'yt-dlp')


const ytDlpUrl =
	'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux'


/*
 * Локальный Windows ничего не скачивает.
 *
 * Vercel build работает на Linux,
 * поэтому здесь binary будет установлен.
 */

if (process.platform !== 'linux') {

	console.log('[YTDLP] Skip Linux binary on', process.platform)
	process.exit(0)
}

await mkdir(
	path.dirname(ytDlpPath),
	{
		recursive: true
	}
)

let ready = false

try {
	await access(ytDlpPath)
	const fileStat = await stat(ytDlpPath)

	if (fileStat.size > 1024) {

		ready = true

		console.log('[YTDLP] Binary already exists:', ytDlpPath, `(${fileStat.size} bytes)`)
	}

} catch {
	// скачиваем ниже
}

if (!ready) {

	console.log('[YTDLP] Downloading official Linux binary...')

	await new Promise(
		(resolve, reject) => {

			const download = (url) => {

					https.get(
						url,
						response => {

							if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
								download(response.headers.location)
								return
							}


							if (response.statusCode !== 200) {
								reject(new Error(`yt-dlp download failed: HTTP ${response.statusCode}`))
								return
							}


							pipeline(response,
								createWriteStream(ytDlpPath))
								.then(resolve)
								.catch(reject)
						}
					)
						.on('error', reject)
				}


			download(ytDlpUrl)
		}
	)

	const fileStat = await stat(ytDlpPath)

	if (fileStat.size <= 1024) {
		throw new Error(`[YTDLP] Downloaded binary is invalid: ${ytDlpPath}`)
	}

	console.log('[YTDLP] Installed:', ytDlpPath, `(${fileStat.size} bytes)`)
}

await chmod(ytDlpPath, 0o755)

console.log('[YTDLP] Permission 755 set')
console.log('[YTDLP] Ready:', ytDlpPath)

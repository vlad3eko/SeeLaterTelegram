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


/*
 * Nitro preset=vercel в текущей сборке
 * создаёт Function:
 *
 * .vercel/output/functions/__fallback.func
 *
 * Всё, что находится внутри неё,
 * будет доступно runtime как /var/task/*
 */
const vercelFunctionDir =
	path.join(
		rootDir,
		'.vercel',
		'output',
		'functions',
		'__fallback.func'
	)


const ytDlpPath =
	path.join(
		vercelFunctionDir,
		'media-tools',
		'yt-dlp'
	)


const ytDlpUrl =
	'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux'


/*
 * На Windows ничего не скачиваем.
 */
if (process.platform !== 'linux') {

	console.log(
		'[YTDLP] Skip Linux binary on',
		process.platform
	)

	process.exit(0)
}


/*
 * К этому моменту nuxt build уже должен
 * закончить создание Vercel output.
 */
try {

	await access(
		vercelFunctionDir
	)

} catch {

	throw new Error(
		`[YTDLP] Vercel Function directory not found: ${vercelFunctionDir}`
	)
}


await mkdir(
	path.dirname(ytDlpPath),
	{
		recursive: true
	}
)


let ready = false


try {

	await access(
		ytDlpPath
	)


	const fileStat =
		await stat(
			ytDlpPath
		)


	if (
		fileStat.size > 1024
	) {

		ready = true

		console.log(
			'[YTDLP] Binary already exists:',
			ytDlpPath,
			`(${fileStat.size} bytes)`
		)
	}

} catch {
	// скачиваем ниже
}


if (!ready) {

	console.log(
		'[YTDLP] Downloading official Linux binary...'
	)


	await new Promise(
		(resolve, reject) => {

			const download =
				(url) => {

					https.get(
						url,
						response => {

							/*
							 * GitHub redirect.
							 */
							if (
								response.statusCode >= 300 &&
								response.statusCode < 400 &&
								response.headers.location
							) {

								response.resume()

								download(
									response.headers.location
								)

								return
							}


							if (
								response.statusCode !== 200
							) {

								response.resume()

								reject(
									new Error(
										`[YTDLP] Download failed: HTTP ${response.statusCode}`
									)
								)

								return
							}


							pipeline(
								response,
								createWriteStream(
									ytDlpPath
								)
							)
								.then(resolve)
								.catch(reject)
						}
					)
						.on(
							'error',
							reject
						)
				}


			download(
				ytDlpUrl
			)
		}
	)


	const fileStat =
		await stat(
			ytDlpPath
		)


	if (
		fileStat.size <= 1024
	) {

		throw new Error(
			`[YTDLP] Downloaded binary is invalid: ${ytDlpPath}`
		)
	}


	console.log(
		'[YTDLP] Installed:',
		ytDlpPath,
		`(${fileStat.size} bytes)`
	)
}


await chmod(
	ytDlpPath,
	0o755
)


console.log(
	'[YTDLP] Permission 755 set'
)


console.log(
	'[YTDLP] Ready:',
	ytDlpPath
)

import {
	mkdir,
	chmod,
	access,
	stat,
	cp
} from 'node:fs/promises'

import {
	createWriteStream
} from 'node:fs'

import {
	pipeline
} from 'node:stream/promises'

import path from 'node:path'

import https from 'node:https'

import {
	fileURLToPath
} from 'node:url'


const __dirname =
	path.dirname(
		fileURLToPath(import.meta.url)
	)


const rootDir =
	path.resolve(
		__dirname,
		'..'
	)


/*
 * Nitro preset=vercel создаёт:
 *
 * .vercel/output/functions/__fallback.func
 *
 * Всё, что находится внутри этой директории,
 * попадает внутрь Vercel Function.
 */
const vercelFunctionDir =
	path.join(
		rootDir,
		'.vercel',
		'output',
		'functions',
		'__fallback.func'
	)


/*
 * -------------------------
 * yt-dlp
 * -------------------------
 */

const ytDlpPath =
	path.join(
		vercelFunctionDir,
		'media-tools',
		'yt-dlp'
	)


const ytDlpUrl =
	'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux'


/*
 * -------------------------
 * BGUTIL plugin
 * -------------------------
 *
 * Исходник находится в проекте:
 *
 * bgutil-ytdlp-pot-provider/plugin
 *
 * В runtime нужен:
 *
 * /var/task/bgutil-ytdlp-pot-provider/plugin
 */
const bgutilPluginSource =
	path.join(
		rootDir,
		'bgutil-ytdlp-pot-provider',
		'plugin'
	)


const bgutilPluginTarget =
	path.join(
		vercelFunctionDir,
		'bgutil-ytdlp-pot-provider',
		'plugin'
	)


/*
 * На Windows локальный Linux binary
 * не устанавливаем.
 */
if (
	process.platform !== 'linux'
) {

	console.log(
		'[YTDLP] Skip Linux preparation on',
		process.platform
	)

	process.exit(0)
}


/*
 * Проверяем, что Nitro build уже завершён.
 */
try {

	await access(
		vercelFunctionDir
	)

} catch {

	throw new Error(
		`[MEDIA TOOLS] Vercel Function directory not found: ${vercelFunctionDir}`
	)
}


/*
 * =========================================================
 * 1. INSTALL YT-DLP
 * =========================================================
 */

await mkdir(
	path.dirname(
		ytDlpPath
	),
	{
		recursive: true
	}
)


let ytDlpReady =
	false


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

		ytDlpReady =
			true

		console.log(
			'[YTDLP] Binary already exists:',
			ytDlpPath,
			`(${fileStat.size} bytes)`
		)
	}

} catch {
	// скачиваем ниже
}


if (
	!ytDlpReady
) {

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
								.then(
									resolve
								)
								.catch(
									reject
								)
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


/*
 * =========================================================
 * 2. COPY BGUTIL PLUGIN
 * =========================================================
 */

try {

	await access(
		bgutilPluginSource
	)

} catch {

	throw new Error(
		`[BGUTIL] Plugin source directory not found: ${bgutilPluginSource}`
	)
}


await mkdir(
	path.dirname(
		bgutilPluginTarget
	),
	{
		recursive: true
	}
)


/*
 * cp() рекурсивно копирует весь plugin directory.
 *
 * force=true нужен, чтобы при повторном build
 * старые файлы не оставались внутри Function.
 */
await cp(
	bgutilPluginSource,
	bgutilPluginTarget,
	{
		recursive: true,
		force: true
	}
)


console.log(
	'[BGUTIL] Plugin copied:',
	bgutilPluginTarget
)


/*
 * Проверяем, что target реально существует.
 */
try {

	await access(
		bgutilPluginTarget
	)

} catch {

	throw new Error(
		`[BGUTIL] Plugin copy failed: ${bgutilPluginTarget}`
	)
}


console.log(
	'[BGUTIL] Plugin ready:',
	bgutilPluginTarget
)

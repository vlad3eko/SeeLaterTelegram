import {mkdir, chmod, access, stat} from 'node:fs/promises'
import {createWriteStream} from 'node:fs'
import {pipeline} from 'node:stream/promises'
import path from 'node:path'
import https from 'node:https'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const ytDlpPath =
	path.join(
		rootDir,
		'media-tools',
		'yt-dlp'
	)

const ytDlpUrl =
	'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux'

const bgutilDir =
	path.join(
		rootDir,
		'bgutil-ytdlp-pot-provider',
		'server'
	)

const npmExecPath =
	process.env.npm_execpath

const runNpm = async (
	args,
	options = {}
) => {

	return execFileAsync(
		'sh',
		[
			'-c',
			`npm ${args.join(' ')}`
		],
		{
			...options,
			maxBuffer:
				options.maxBuffer ??
				50 * 1024 * 1024
		}
	)
}

console.log('[MEDIA TOOLS] Preparing...')

await mkdir(
	path.dirname(ytDlpPath),
	{
		recursive: true
	}
)


// ─────────────────────────────────────────────
// YT-DLP
// ─────────────────────────────────────────────

let ytDlpReady = false

try {
	await access(ytDlpPath)

	const fileStat =
		await stat(ytDlpPath)

	if (fileStat.size > 1024) {

		ytDlpReady = true

		console.log(
			'[YTDLP] Linux binary already exists:',
			ytDlpPath,
			`(${fileStat.size} bytes)`
		)

	} else {

		console.log(
			'[YTDLP] Existing binary is empty or invalid; redownloading...'
		)
	}

} catch {

	console.log(
		'[YTDLP] Linux binary is missing; downloading...'
	)
}


if (!ytDlpReady) {

	console.log(
		'[YTDLP] Downloading official Linux binary...'
	)

	await new Promise((resolve, reject) => {

		const download = (url) => {

			https.get(
				url,
				response => {

					if (
						response.statusCode >= 300 &&
						response.statusCode < 400 &&
						response.headers.location
					) {

						download(
							response.headers.location
						)

						return
					}

					if (response.statusCode !== 200) {

						reject(
							new Error(
								`yt-dlp download failed: HTTP ${response.statusCode}`
							)
						)

						return
					}

					pipeline(
						response,
						createWriteStream(ytDlpPath)
					)
						.then(resolve)
						.catch(reject)
				}
			).on(
				'error',
				reject
			)
		}

		download(ytDlpUrl)
	})

	const fileStat =
		await stat(ytDlpPath)

	if (fileStat.size <= 1024) {

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


// ─────────────────────────────────────────────
// YT-DLP PERMISSIONS
// ─────────────────────────────────────────────

if (process.platform === 'linux') {

	await chmod(
		ytDlpPath,
		0o755
	)

	console.log(
		'[YTDLP] Executable permission set: 755'
	)
}


// ─────────────────────────────────────────────
// YT-DLP CHECK
// ─────────────────────────────────────────────

if (process.platform === 'linux') {

	console.log(
		'[YTDLP] Checking Linux binary...'
	)

	const {
		stdout
	} = await execFileAsync(
		ytDlpPath,
		['--version']
	)

	console.log(
		'[YTDLP VERSION]',
		stdout.trim()
	)

} else {

	console.log(
		'[YTDLP] Linux binary prepared; version check skipped on',
		process.platform
	)
}


// ─────────────────────────────────────────────
// BGUTIL
// ─────────────────────────────────────────────

console.log(
	'[ENV] npm exists:',
	await access('/usr/bin/npm')
		.then(() => true)
		.catch(() => false)
)

console.log(
	'[ENV] node exists:',
	await access('/usr/bin/node')
		.then(() => true)
		.catch(() => false)
)

console.log(
	'[ENV] node24 exists:',
	await access('/node24/bin/node')
		.then(() => true)
		.catch(() => false)
)

console.log(
	'[BGUTIL] Build completed'
)

console.log(
	'[BGUTIL] Installing provider dependencies...'
)

if (process.platform === 'win32') {

	await execFileAsync(
		'cmd.exe',
		['/d', '/s', '/c', 'npm ci'],
		{
			cwd: bgutilDir,
			maxBuffer: 50 * 1024 * 1024
		}
	)

	await execFileAsync(
		'cmd.exe',
		['/d', '/s', '/c', 'npx tsc'],
		{
			cwd: bgutilDir,
			maxBuffer: 50 * 1024 * 1024
		}
	)

} else {

	await runNpm(
		['ci'],
		{
			cwd: bgutilDir
		}
	)

	await runNpm(
		['exec', '--', 'tsc'],
		{
			cwd: bgutilDir
		}
	)
}

console.log(
	'[MEDIA TOOLS] Ready'
)

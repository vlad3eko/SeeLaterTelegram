import {access, cp, copyFile, mkdir, rm, stat} from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const context = path.join(root, '.cloud-run-build', 'reel-worker')

const exists = async filePath => {
    try {
        await access(filePath)
        return true
    } catch {
        return false
    }
}

const copyRequired = async (source, destination, options = {}) => {
    if (!(await exists(source))) {
        throw new Error(`[BUILD CONTEXT] Required path not found: ${source}`)
    }
    await mkdir(path.dirname(destination), {recursive: true})
    await cp(source, destination, {recursive: true, ...options})
}

const copyFileRequired = async (source, destination) => {
    if (!(await exists(source))) {
        throw new Error(`[BUILD CONTEXT] Required file not found: ${source}`)
    }
    await mkdir(path.dirname(destination), {recursive: true})
    await copyFile(source, destination)
}

const relative = value => path.join(root, value)

const workerPackage = relative('workers/reel-worker/package.json')
const workerLock = relative('workers/reel-worker/package-lock.json')

if (!(await exists(workerLock))) {
    throw new Error(
        '[BUILD CONTEXT] workers/reel-worker/package-lock.json is missing. ' +
        'Run npm install --package-lock-only inside workers/reel-worker first.'
    )
}

await rm(context, {recursive: true, force: true})
await mkdir(context, {recursive: true})

await copyFileRequired(
    relative('workers/reel-worker/Dockerfile'),
    path.join(context, 'Dockerfile')
)
await copyFileRequired(workerPackage, path.join(context, 'workers/reel-worker/package.json'))
await copyFileRequired(workerLock, path.join(context, 'workers/reel-worker/package-lock.json'))
await copyRequired(
    relative('workers/reel-worker/src'),
    path.join(context, 'workers/reel-worker/src')
)

await copyRequired(
    relative('server/global/engine/instagram/reel'),
    path.join(context, 'server/global/engine/instagram/reel')
)
await copyRequired(
    relative('server/global/engine/instagram/scripts-yt-bgutil'),
    path.join(context, 'server/global/engine/instagram/scripts-yt-bgutil')
)
await copyRequired(
    relative('public/instagram'),
    path.join(context, 'public/instagram')
)

// Whisper model for the subtitle timing pass (see workers/reel-worker/Dockerfile).
// ~488 MB, so the size is checked: a Git LFS pointer or a broken download would
// otherwise only show up as a failed subtitle step in production.
const whisperModel = relative('server/models/ggml-small.bin')
if (!(await exists(whisperModel))) {
    throw new Error(
        '[BUILD CONTEXT] server/models/ggml-small.bin is missing. Download the ggml-small model ' +
        '(https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin) into server/models/.'
    )
}
const whisperModelSize = (await stat(whisperModel)).size
if (whisperModelSize < 100_000_000) {
    throw new Error(
        `[BUILD CONTEXT] server/models/ggml-small.bin is only ${whisperModelSize} bytes; the model file looks incomplete.`
    )
}
await copyFileRequired(
    whisperModel,
    path.join(context, 'server/models/ggml-small.bin')
)

await copyRequired(
    relative('bgutil-ytdlp-pot-provider/plugin'),
    path.join(context, 'bgutil-ytdlp-pot-provider/plugin'),
    {
        filter: source => !source.endsWith('getpot_bgutil_http.py')
    }
)
await copyFileRequired(
    relative('bgutil-ytdlp-pot-provider/server/package.json'),
    path.join(context, 'bgutil-ytdlp-pot-provider/server/package.json')
)
await copyFileRequired(
    relative('bgutil-ytdlp-pot-provider/server/package-lock.json'),
    path.join(context, 'bgutil-ytdlp-pot-provider/server/package-lock.json')
)
await copyRequired(
    relative('bgutil-ytdlp-pot-provider/server/build'),
    path.join(context, 'bgutil-ytdlp-pot-provider/server/build')
)

console.log('[BUILD CONTEXT READY]', {
    context,
    note: 'Only worker source, required media modules, BGUtil files, Instagram assets and the Whisper model were staged. No .env files were copied.'
})

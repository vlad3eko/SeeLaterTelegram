
import {
    DeleteObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client
} from '@aws-sdk/client-s3'

import {createReadStream} from 'node:fs'
import {access, copyFile, mkdir, readdir, rm, stat} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'


// ЛОКАЛЬНЫЙ РЕЖИМ ДЛЯ РАЗРАБОТКИ.
// Если задана REEL_LOCAL_STORAGE_DIR, вместо Cloudflare R2 используется папка на диске:
// те же ключи (instagram/reels/clean/...), только файлы лежат в этой папке, а «публичная
// ссылка» — это file:///... Облачные переменные при этом не нужны и R2 не трогается.
// Нужен для tmp-прогона публикации (reel/scripts/dryrun-publish.ts).
// В Vercel и Cloud Run режим запрещён, чтобы рабочий кэш не подменился папкой контейнера.
const localStorageDirectoryRaw = process.env.REEL_LOCAL_STORAGE_DIR?.trim()

if (
    localStorageDirectoryRaw &&
    (
        process.env.VERCEL === '1' ||
        process.env.CLOUD_RUN_JOB ||
        process.env.K_SERVICE
    )
) {
    throw new Error(
        '[R2 LOCAL] REEL_LOCAL_STORAGE_DIR is for local development only and must not be set in Vercel or Cloud Run'
    )
}

const localStorageDirectory = localStorageDirectoryRaw
    ? path.resolve(localStorageDirectoryRaw)
    : undefined

export const isCloudflareR2LocalMode = Boolean(localStorageDirectory)


const r2AccountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID
const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
const r2Bucket = process.env.CLOUDFLARE_R2_BUCKET
const r2PublicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL

if (
    !localStorageDirectory &&
    (
        !r2AccountId ||
        !r2AccessKeyId ||
        !r2SecretAccessKey ||
        !r2Bucket ||
        !r2PublicUrl
    )
) {
    throw new Error('Cloudflare R2 environment variables are missing')
}


const normalizedPublicUrl = (r2PublicUrl ?? '').replace(/\/+$/, '')


const s3 = localStorageDirectory
    ? undefined
    : new S3Client({
        region: 'auto',

        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,

        credentials: {
            accessKeyId: r2AccessKeyId!,
            secretAccessKey: r2SecretAccessKey!
        }
    })


const getS3 = (): S3Client => {
    if (!s3) {
        throw new Error('[R2] Cloud client is not available in local storage mode')
    }

    return s3
}


// Путь файла в локальной папке для ключа R2. Ключ не может выйти за пределы папки.
const getLocalPathForKey = (key: string): string => {
    const root = localStorageDirectory!
    const target = path.resolve(root, ...key.split('/'))

    if (target !== root && !target.startsWith(root + path.sep)) {
        throw new Error('[R2 LOCAL] Object key points outside the local storage directory')
    }

    return target
}


export const storageCloudflareR2 = async (
    filePath: string,
    key: string
): Promise<string> => {

    if (localStorageDirectory) {
        const target = getLocalPathForKey(key)

        await mkdir(path.dirname(target), {recursive: true})
        await copyFile(filePath, target)

        console.log('[R2 LOCAL STORED]', {key, target})

        return pathToFileURL(target).href
    }

    const fileStream = createReadStream(filePath)

    await getS3().send(
        new PutObjectCommand({
            Bucket: r2Bucket,
            Key: key,
            Body: fileStream,
            ContentType: 'video/mp4'
        })
    )

    return `${normalizedPublicUrl}/${key}`
}


export const deleteFromCloudflareR2 = async (
    key: string
) => {

    if (localStorageDirectory) {
        await rm(getLocalPathForKey(key), {force: true})
        return
    }

    await getS3().send(
        new DeleteObjectCommand({
            Bucket: r2Bucket,
            Key: key
        })
    )
}


export const existsInCloudflareR2 = async (
    key: string
) => {

    if (localStorageDirectory) {
        try {
            await access(getLocalPathForKey(key))

            return true

        } catch (error: any) {
            if (error?.code === 'ENOENT') {
                return false
            }

            throw error
        }
    }

    try {
        await getS3().send(
            new HeadObjectCommand({
                Bucket: r2Bucket,
                Key: key
            })
        )

        return true

    } catch (error: any) {
        if (
            error?.name === 'NotFound' ||
            error?.$metadata?.httpStatusCode === 404
        ) {
            return false
        }

        throw error
    }
}


export type CloudflareR2Object = {key: string, lastModified: Date}

/**
 * Все объекты с ключом, начинающимся с prefix (например `instagram/reels/temp/`).
 * Нужен ежечасной чистке временных папок (reel/jobs/reelStorageCleanup.ts).
 */
export const listCloudflareR2Objects = async (prefix: string): Promise<CloudflareR2Object[]> => {
    if (localStorageDirectory) {
        const folder = prefix.replace(/\/+$/, '')
        const directory = getLocalPathForKey(folder)
        let names: string[]
        try {
            names = await readdir(directory)
        } catch (error: any) {
            if (error?.code === 'ENOENT') return []
            throw error
        }
        const objects: CloudflareR2Object[] = []
        for (const name of names) {
            const info = await stat(path.join(directory, name))
            if (info.isFile()) objects.push({key: `${folder}/${name}`, lastModified: info.mtime})
        }
        return objects
    }

    const objects: CloudflareR2Object[] = []
    let continuationToken: string | undefined

    do {
        const page = await getS3().send(
            new ListObjectsV2Command({
                Bucket: r2Bucket,
                Prefix: prefix,
                ContinuationToken: continuationToken
            })
        )
        for (const item of page.Contents ?? []) {
            if (item.Key) objects.push({key: item.Key, lastModified: item.LastModified ?? new Date(0)})
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (continuationToken)

    return objects
}


export const getCloudflareR2Url = (key: string) => {
    if (localStorageDirectory) {
        return pathToFileURL(getLocalPathForKey(key)).href
    }

    return `${normalizedPublicUrl}/${key}`
}


// Получаем ключ R2 из публичной ссылки.
export const getCloudflareR2KeyFromUrl = (url: string): string => {
    if (localStorageDirectory) {
        if (!url.startsWith('file:')) {
            throw new Error('[R2 DELETE] URL does not belong to the local storage directory')
        }

        const relative = path.relative(localStorageDirectory, fileURLToPath(url))

        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('[R2 DELETE] URL does not belong to the local storage directory')
        }

        return relative.split(path.sep).join('/')
    }

    const prefix = `${normalizedPublicUrl}/`

    if (!url.startsWith(prefix)) {
        throw new Error('[R2 DELETE] URL does not belong to configured public R2 URL')
    }

    const key = decodeURIComponent(
        url.slice(prefix.length).split('?')[0] ?? ''
    )

    if (!key) {
        throw new Error('[R2 DELETE] Object key is empty')
    }

    return key
}


// Удаляем объект, передав его публичную ссылку.
export const deleteCloudflareR2ObjectByUrl = async (
    url: string
) => {
    const key = getCloudflareR2KeyFromUrl(url)

    await deleteFromCloudflareR2(key)

    console.log('[R2 OBJECT DELETED BY URL]', {
        key
    })
}

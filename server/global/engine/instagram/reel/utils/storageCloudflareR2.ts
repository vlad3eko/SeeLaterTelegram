import {
    DeleteObjectCommand, HeadObjectCommand, PutObjectCommand,
    S3Client
} from '@aws-sdk/client-s3'

import {createReadStream} from 'node:fs'

const r2AccountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID
const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
const r2Bucket = process.env.CLOUDFLARE_R2_BUCKET
const r2PublicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL

if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket || !r2PublicUrl)
    throw new Error('Cloudflare R2 environment variables are missing')

const s3 =
    new S3Client({
        region: 'auto',

        endpoint:
            `https://${r2AccountId}.r2.cloudflarestorage.com`,

        credentials: {
            accessKeyId: r2AccessKeyId,
            secretAccessKey: r2SecretAccessKey
        }
    })

export const storageCloudflareR2 = async (
    filePath: string,
    key: string
) => {

    const fileStream =
        createReadStream(filePath)

    await s3.send(
        new PutObjectCommand({
            Bucket: r2Bucket,

            Key: key,

            Body: fileStream,

            ContentType: 'video/mp4'
        })
    )

    const normalizedPublicUrl =
        r2PublicUrl.replace(/\/$/, '')

    return `${normalizedPublicUrl}/${key}`
}

export const deleteFromCloudflareR2 = async (
    key: string
) => {

    await s3.send(
        new DeleteObjectCommand({
            Bucket: r2Bucket,
            Key: key
        })
    )
}

export const existsInCloudflareR2 = async (
    key: string
) => {
    try {
        await s3.send(new HeadObjectCommand({
            Bucket: r2Bucket,
            Key: key
        }))

        return true
    } catch (error: any) {
        if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
            return false
        }

        throw error
    }
}

export const getCloudflareR2Url = (key: string) => {
    return `${r2PublicUrl.replace(/\/$/, '')}/${key}`
}

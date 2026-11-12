import {copyFile, mkdir, rm, stat, unlink, writeFile} from "node:fs/promises"
import path from "node:path"
import {fileURLToPath} from "node:url"

/**
 * Общие части шагов сборки Reel (clean, хуки, финал): данные фильма, пути в R2,
 * журнал шагов и временные файлы одного запуска.
 */

export type ReelContent = {
    id: number
    type: string
    title?: string
    overview?: string
    genre?: string | Array<{
        id?: number
        name?: string
    } | string>
    rating?: number | string
}

/**
 * Пути в R2 зависят только от фильма и ключа трейлера: кэш не сбрасывается, новые
 * файлы пишутся поверх старых (решение владельца 11.11).
 */
export const reelR2Paths = (content: Pick<ReelContent, 'id' | 'type'>, keyTrailer: string) => {
    const base = `${content.id}_${content.type}_${keyTrailer}`

    return {
        /** Полный исходный трейлер. При ручной проверке живёт до финала (для «Пересобрать»). */
        source: `instagram/reels/temp/${base}.mp4`,
        /** Расшифровка всего исходника нарезки (fragments/sourceTranscript.ts), живёт с исходником. */
        transcript: `instagram/reels/temp/${base}_transcript.json`,
        clean: `instagram/reels/clean/${base}_clean.mp4`,
        /** Лёгкая копия clean для показа в Telegram (Bot API берёт видео по ссылке до 20 МБ). */
        preview: `instagram/reels/preview/${base}_preview.mp4`,
        /** Превью фрагментов нарезки для альбома в Telegram (номер с единицы). */
        fragmentPreview: (index: number) => `instagram/reels/preview/${base}_frag${index}.mp4`,
        /** Общее начало ключей превью этой задачи (защита и чистка). */
        previewPrefix: `instagram/reels/preview/${base}_`,
        reel: `instagram/reels/reel/${base}_reel.mp4`
    }
}

export const runReelStep = async <T>(
    name: string,
    action: () => Promise<T>
): Promise<T> => {
    const startedAt = Date.now()

    console.log(`[REEL STEP START] ${name}`)

    try {
        const result = await action()

        console.log(`[REEL STEP DONE] ${name}`, {
            durationMs: Date.now() - startedAt
        })

        return result
    } catch (error) {
        console.error(`[REEL STEP ERROR] ${name}`, {
            durationMs: Date.now() - startedAt,
            error
        })

        throw error
    }
}

export const downloadR2ObjectToFile = async (
    url: string,
    outputPath: string
): Promise<void> => {
    if (!url) {
        throw new Error('[R2 DOWNLOAD] URL is missing')
    }

    // Локальный режим разработки (REEL_LOCAL_STORAGE_DIR): «ссылка» вида file:///..., читаем с диска.
    if (url.startsWith('file:')) {
        const localPath = fileURLToPath(url)
        const sizeBytes = (await stat(localPath)).size

        if (sizeBytes === 0) {
            throw new Error('[R2 DOWNLOAD] Local file is empty')
        }

        await mkdir(path.dirname(outputPath), {recursive: true})
        await copyFile(localPath, outputPath)

        console.log('[R2 DOWNLOADED]', {
            outputPath,
            sizeBytes,
            source: 'local'
        })

        return
    }

    const response = await fetch(url)

    if (!response.ok) {
        throw new Error(
            `[R2 DOWNLOAD] Download failed: HTTP ${response.status}`
        )
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    if (buffer.length === 0) {
        throw new Error('[R2 DOWNLOAD] Downloaded file is empty')
    }

    await mkdir(path.dirname(outputPath), {recursive: true})
    await writeFile(outputPath, buffer)

    console.log('[R2 DOWNLOADED]', {
        outputPath,
        sizeBytes: buffer.length
    })
}

/**
 * Временные файлы и папки одного запуска. Шаги регистрируют то, что создали,
 * `cleanup()` в finally удаляет всё, ошибки удаления только пишутся в лог.
 */
export class ReelWorkspace {
    private readonly files = new Set<string>()
    private readonly directories = new Set<string>()

    trackFile(filePath: string | undefined): string | undefined {
        if (filePath) this.files.add(filePath)
        return filePath
    }

    trackDirectory(directory: string | undefined): void {
        if (directory) this.directories.add(directory)
    }

    async cleanup(): Promise<void> {
        for (const directory of this.directories) {
            try {
                await rm(directory, {recursive: true, force: true})
                console.log('[LOCAL TEMP DIRECTORY DELETE]', directory)
            } catch (error) {
                console.error('[LOCAL TEMP DIRECTORY DELETE ERROR]', directory, error)
            }
        }

        for (const filePath of this.files) {
            try {
                await unlink(filePath)
                console.log('[LOCAL TEMP DELETE]', filePath)
            } catch (error: any) {
                if (error?.code !== 'ENOENT') {
                    console.error('[LOCAL TEMP DELETE ERROR]', filePath, error)
                }
            }
        }

        this.files.clear()
        this.directories.clear()
    }
}

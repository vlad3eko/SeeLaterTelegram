import { spawn } from 'node:child_process';

/** Upper bound for the cached grayscale frames. */
const MAX_SAMPLED_BYTES = 512 * 1024 * 1024;

export type BackgroundRegionRequest = {
    id: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
    sampleTimesSeconds: number[];
};

export type BackgroundLuminanceOptions = {
    videoPath: string;
    width: number;
    height: number;
    durationSeconds: number;
    requests: BackgroundRegionRequest[];
    ffmpegPath?: string;
    sampleFps?: number;
};

/**
 * Samples a quarter-resolution grayscale version of the source video and
 * computes mean luma beneath each word's measured bounding box.
 *
 * This intentionally runs once for the whole source video rather than
 * launching one FFmpeg process per word.
 */
export async function analyzeBackgroundLuminance(
    options: BackgroundLuminanceOptions,
): Promise<Map<string, number>> {
    const result = new Map<string, number>();

    if (options.requests.length === 0) {
        return result;
    }

    const fps = Math.max(1, Math.min(8, options.sampleFps ?? 4));
    const sampleWidth = Math.max(2, Math.floor(options.width / 4 / 2) * 2);
    const sampleHeight = Math.max(2, Math.floor(options.height / 4 / 2) * 2);
    const frameSize = sampleWidth * sampleHeight;
    const frameDuration = 1 / fps;
    const ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';

    const args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-nostdin',
        '-i', options.videoPath,
        '-an',
        '-vf', `fps=${fps},scale=${sampleWidth}:${sampleHeight}:flags=area,format=gray`,
        '-fps_mode',
        'passthrough',
        '-pix_fmt', 'gray',
        '-f', 'rawvideo',
        'pipe:1',
    ];

    const raw = await new Promise<Buffer>((resolve, reject) => {
        const child = spawn(ffmpegPath, args, {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        const chunks: Buffer[] = [];
        let stderr = '';
        let settled = false;
        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error('[SUBTITLE BACKGROUND] FFmpeg luminance sampling timed out.'));
        }, 180_000);
        timeout.unref();

        const finish = (error?: Error, data?: Buffer) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (error) reject(error);
            else resolve(data ?? Buffer.alloc(0));
        };

        let total = 0;
        child.stdout.on('data', (chunk: Buffer) => {
            total += chunk.length;
            // Frames are cached in memory: stop a runaway (very long) input.
            if (total > MAX_SAMPLED_BYTES) {
                child.kill('SIGTERM');
                finish(new Error('[SUBTITLE BACKGROUND] Sampled video is too long for luminance analysis.'));
                return;
            }
            chunks.push(Buffer.from(chunk));
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => {
            stderr = (stderr + chunk).slice(-12_000);
        });
        child.once('error', (error) => {
            finish(new Error(
                `[SUBTITLE BACKGROUND] Could not start FFmpeg: ${error.message}`,
                { cause: error },
            ));
        });
        child.once('close', (code, signal) => {
            if (code !== 0) {
                finish(new Error(
                    `[SUBTITLE BACKGROUND] FFmpeg failed (code=${code ?? 'null'}, signal=${signal ?? 'none'}). ${stderr}`,
                ));
                return;
            }
            finish(undefined, Buffer.concat(chunks));
        });
    });

    const frameCount = Math.floor(raw.length / frameSize);

    if (frameCount === 0) {
        throw new Error('[SUBTITLE BACKGROUND] FFmpeg returned no grayscale frames.');
    }

    const scaleX = sampleWidth / options.width;
    const scaleY = sampleHeight / options.height;

    for (const request of options.requests) {
        const x0 = Math.max(0, Math.min(sampleWidth - 1, Math.floor(request.left * scaleX)));
        const y0 = Math.max(0, Math.min(sampleHeight - 1, Math.floor(request.top * scaleY)));
        const x1 = Math.max(x0 + 1, Math.min(sampleWidth, Math.ceil(request.right * scaleX)));
        const y1 = Math.max(y0 + 1, Math.min(sampleHeight, Math.ceil(request.bottom * scaleY)));

        let totalLuma = 0;
        let totalPixels = 0;
        const sampleTimes = request.sampleTimesSeconds.length > 0
            ? request.sampleTimesSeconds
            : [0];

        for (const timeSeconds of sampleTimes) {
            const frameIndex = Math.max(
                0,
                Math.min(
                    frameCount - 1,
                    Math.round(Math.max(0, Math.min(options.durationSeconds - frameDuration, timeSeconds)) * fps),
                ),
            );
            const frameOffset = frameIndex * frameSize;

            for (let y = y0; y < y1; y += 1) {
                const rowOffset = frameOffset + y * sampleWidth;
                for (let x = x0; x < x1; x += 1) {
                    totalLuma += raw[rowOffset + x] ?? 0;
                    totalPixels += 1;
                }
            }
        }

        result.set(
            request.id,
            totalPixels > 0 ? totalLuma / totalPixels / 255 : 0,
        );
    }

    return result;
}

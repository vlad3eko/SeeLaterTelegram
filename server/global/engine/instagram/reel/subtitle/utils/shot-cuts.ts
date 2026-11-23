import { runProcess } from './process.js';

/** The same scdet threshold as the framing analysis (tracking/framing.ts). */
const SCDET_THRESHOLD = 10;
/** Cuts closer than this are one cut (a flash or a two-frame dissolve). */
const CUT_MERGE_SECONDS = 0.1;

/** Pure: cut times from ffmpeg `metadata=mode=print:key=lavfi.scd.time` output, sorted and merged. */
export function parseShotCuts(stderr: string): number[] {
    const times = [...stderr.matchAll(/lavfi\.scd\.time=(\d+(?:\.\d+)?)/gu)]
        .map(match => Number(match[1]))
        .filter(time => Number.isFinite(time) && time > 0)
        .sort((a, b) => a - b);
    const merged: number[] = [];

    for (const time of times) {
        if (merged.length && time - merged.at(-1)! < CUT_MERGE_SECONDS) {
            merged[merged.length - 1] = time;
        } else {
            merged.push(time);
        }
    }

    return merged;
}

/**
 * Hard cuts of the finished clean clip, seconds. A phrase whose speech is over
 * leaves at the cut, as on the reference (the caption does not ride over into the
 * next shot). A failure returns no cuts: the captions then only follow the speech.
 */
export async function detectShotCuts(videoPath: string, ffmpegPath = 'ffmpeg'): Promise<number[]> {
    try {
        const { stderr } = await runProcess(ffmpegPath, [
            '-hide_banner', '-nostats', '-nostdin', '-loglevel', 'info',
            '-i', videoPath,
            '-an', '-sn',
            '-vf', `scale=320:-2,scdet=threshold=${SCDET_THRESHOLD},metadata=mode=print:key=lavfi.scd.time`,
            '-f', 'null', '-',
        ], { label: 'Detect shot cuts', timeoutMs: 120_000 });

        return parseShotCuts(stderr);
    } catch (error) {
        console.warn('[SUBTITLE] Shot cut detection failed; captions follow the speech only.',
            error instanceof Error ? error.message : String(error));

        return [];
    }
}

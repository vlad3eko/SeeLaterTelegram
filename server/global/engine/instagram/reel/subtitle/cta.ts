import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  getFormatSubtitleOverrides,
  mergeSubtitleOverrides,
  resolveSubtitleConfig,
} from './config.js';
import { buildInstagramSubtitleBlocks } from './layout/build-subtitle-blocks.js';
import { generateInstagramSubtitleAss } from './render/generate-ass.js';
import type { SubtitleConfigOverrides, WordTiming } from './types.js';

/**
 * «Сохрани, чтобы не потерять» нашим эффектом субтитров внизу кадра.
 * Решение владельца 11.11 по прототипу: призыв внизу, в середине ролика и в
 * конце, по 3-4 секунды. Отдельная дорожка ASS: она не зависит от Whisper,
 * поэтому показывается и тогда, когда субтитры речи выключены или не вышли.
 */

/** Слова призыва: [текст, начало, конец] в секундах от начала показа. */
export const SAVE_CTA_WORDS: ReadonlyArray<readonly [string, number, number]> = [
  ['Сохрани,', 0.0, 0.55],
  ['чтобы', 0.65, 1.1],
  ['не', 1.2, 1.45],
  ['потерять', 1.55, 2.3],
];

/**
 * Сколько секунд фраза остаётся на экране с учётом задержки выхода: измерено
 * по ASS настоящего генератора на прототипе (см. TASKS.md).
 */
export const SAVE_CTA_VISIBLE_SECONDS = 4.0;

/**
 * Нижняя дорожка: базовые линии 1655 и 1705 на холсте 1080x1920 дают около 86%
 * высоты квадрата 1080x1080, одна строка. Размер букв и холст берутся из
 * пресета квадрата (getFormatSubtitleOverrides).
 */
export const saveCtaOverrides: SubtitleConfigOverrides = {
  typography: {
    topLineBaselineAt1080: 1655,
    bottomLineBaselineAt1080: 1705,
    maxLines: 1,
  },
};

export type SpeechWindow = { start: number; end: number };

export type SaveCtaOptions = {
  /** Готовый clean: нужен генератору для яркости фона под словами. */
  videoPath: string;
  durationSeconds: number;
  width?: number;
  height?: number;
  frameRate?: number;
  workDirectory: string;
  runId?: string;
  fontFilePath?: string;
  ffmpegPath?: string;
  /** Окна с репликами, чтобы середину поставить туда, где тише. */
  speechWindows?: SpeechWindow[];
};

export type SaveCtaResult = {
  assPath: string;
  starts: number[];
};

function overlapSeconds(a0: number, a1: number, windows: SpeechWindow[]): number {
  let total = 0;
  for (const window of windows) {
    total += Math.max(0, Math.min(a1, window.end) - Math.max(a0, window.start));
  }
  return total;
}

/**
 * Моменты показа: середина ролика и самый конец. Середина двигается в пределах
 * 40-60% длины к месту с наименьшим пересечением с репликами (при равенстве к
 * центру). У совсем короткого ролика остаётся один показ в конце.
 */
export function chooseSaveCtaStarts(
  durationSeconds: number,
  speechWindows: SpeechWindow[] = [],
): number[] {
  const visible = SAVE_CTA_VISIBLE_SECONDS;
  const endStart = Math.max(0, durationSeconds - visible - 0.15);

  if (durationSeconds < visible * 2 + 4) {
    return [Number(endStart.toFixed(2))];
  }

  const latestMid = endStart - visible - 1.5;
  let best: { start: number; score: number; distance: number } | undefined;

  for (let start = durationSeconds * 0.4; start <= durationSeconds * 0.6 + 1e-9; start += 0.25) {
    if (start < 3 || start > latestMid) continue;
    const score = overlapSeconds(start, start + visible, speechWindows);
    const distance = Math.abs(start + visible / 2 - durationSeconds / 2);
    if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) <= 1e-9 && distance < best.distance)) {
      best = { start, score, distance };
    }
  }

  const middle = best?.start ?? Math.min(Math.max(3, durationSeconds / 2 - visible / 2), latestMid);
  return [Number(middle.toFixed(2)), Number(endStart.toFixed(2))];
}

export function buildSaveCtaWords(starts: number[]): WordTiming[] {
  const words: WordTiming[] = [];
  for (const start of starts) {
    for (const [text, from, to] of SAVE_CTA_WORDS) {
      words.push({
        text,
        start: Number((start + from).toFixed(3)),
        end: Number((start + to).toFixed(3)),
        speaker: 'S1',
      });
    }
  }
  return words;
}

/** Создаёт ASS-дорожку призыва. Ошибка не должна останавливать Reel: вызывающий ловит её сам. */
export async function prepareSaveCtaTrack(options: SaveCtaOptions): Promise<SaveCtaResult> {
  const width = options.width ?? 1080;
  const height = options.height ?? 1080;
  const runId = (options.runId ?? randomUUID()).replace(/[^A-Za-z0-9_-]/g, '_');
  const runDirectory = path.join(path.resolve(options.workDirectory), runId);
  await mkdir(runDirectory, { recursive: true });

  const fontFilePath = options.fontFilePath ??
    process.env.SUBTITLE_FONT_PATH ??
    path.resolve('public/instagram/fonts/Montserrat-ExtraBold.ttf');

  const config = resolveSubtitleConfig(
    mergeSubtitleOverrides(getFormatSubtitleOverrides(width, height), saveCtaOverrides),
  );

  const starts = chooseSaveCtaStarts(options.durationSeconds, options.speechWindows);
  const blocks = buildInstagramSubtitleBlocks(buildSaveCtaWords(starts), config, []);
  const ass = await generateInstagramSubtitleAss(
    blocks,
    width,
    height,
    config,
    [],
    fontFilePath,
    {
      videoPath: options.videoPath,
      ffmpegPath: options.ffmpegPath ?? process.env.FFMPEG_PATH,
      frameRate: options.frameRate ?? 30,
      durationSeconds: options.durationSeconds,
    },
  );

  const assPath = path.join(runDirectory, 'save-cta.ass');
  await writeFile(assPath, ass, 'utf8');

  console.info('[SUBTITLE] Save CTA track prepared', {
    assPath,
    starts,
    resolution: `${width}x${height}`,
  });

  return { assPath, starts };
}

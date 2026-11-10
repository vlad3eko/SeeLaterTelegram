import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { assertFileExists, escapeFilterValue, runProcess } from '../utils/process.js';
import type { RenderSubtitlesOptions } from '../types.js';
import { probeInstagramVideo } from '../utils/probe-video.js';

export async function burnInstagramSubtitles(options: RenderSubtitlesOptions): Promise<void> {
  const ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
  await assertFileExists(options.inputPath, 'Input video');
  await assertFileExists(options.assPath, 'ASS subtitle file');
  if (path.resolve(options.inputPath) === path.resolve(options.outputPath)) {
    throw new Error('Subtitle rendering must write to a new output file; the clean source must remain untouched.');
  }

  await mkdir(path.dirname(path.resolve(options.outputPath)), { recursive: true });

  const assPath = escapeFilterValue(path.resolve(options.assPath).replace(/\\/g, '/'));
  const fontsDir = options.fontsDirectory
    ? `:fontsdir=${escapeFilterValue(path.resolve(options.fontsDirectory).replace(/\\/g, '/'))}`
    : '';

  const assContents = await readFile(options.assPath, 'utf8');
  const dialogueEndTimes = assContents
    .split(/\r?\n/u)
    .flatMap((line) => {
      const match = line.match(/^Dialogue:\s*\d+,([^,]+),([^,]+),/u);
      if (!match?.[2]) return [];

      const timeMatch = match[2].trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/u);
      if (!timeMatch) return [];

      const hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);
      const seconds = Number(timeMatch[3]);
      const centiseconds = Number(timeMatch[4]);
      return [hours * 3600 + minutes * 60 + seconds + centiseconds / 100];
    });

  const maximumAssEndSeconds = Math.max(0, ...dialogueEndTimes);
  const videoInfo = await probeInstagramVideo(
    options.inputPath,
    options.ffprobePath,
  );
  const requiredVideoTailSeconds = Math.max(
    0,
    maximumAssEndSeconds - videoInfo.durationSeconds + 0.05,
  );

  // Pad BEFORE ASS. Padding after ASS freezes the last already-rendered frame.
  const padFilter = requiredVideoTailSeconds > 0
    ? `tpad=stop_mode=clone:stop_duration=${requiredVideoTailSeconds.toFixed(3)},`
    : '';
  const filter = `${padFilter}ass=filename='${assPath}'${fontsDir}`;

  console.info('[SUBTITLE] Burning ASS subtitles into video', {
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    sourceDurationSeconds: videoInfo.durationSeconds,
    maximumAssEndSeconds,
    requiredVideoTailSeconds,
  });

  const audioArgs = options.config.render.audioCodec === 'copy'
    ? ['-c:a', 'copy']
    : ['-c:a', 'aac', '-b:a', options.config.render.audioBitrate];

  await runProcess(ffmpegPath, [
    '-hide_banner', '-nostdin', '-y',
    '-i', options.inputPath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-vf', filter,
    '-c:v', options.config.render.videoCodec,
    '-preset', options.config.render.preset,
    '-crf', String(options.config.render.crf),
    '-pix_fmt', 'yuv420p',
    ...audioArgs,
    '-movflags', '+faststart',
    options.outputPath,
  ], { label: 'Burn Instagram ASS subtitles', timeoutMs: 30 * 60 * 1000 });
}

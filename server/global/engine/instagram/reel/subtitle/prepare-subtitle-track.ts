import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  getFormatSubtitleOverrides,
  mergeSubtitleOverrides,
  resolveSubtitleConfig,
} from './config.js';
import { buildInstagramSubtitleBlocks } from './layout/build-subtitle-blocks.js';
import { generateInstagramSubtitleAss, getMaximumDialogueEndSeconds } from './render/generate-ass.js';
import { transcribeInstagramTranscript } from './transcription/whisper.js';
import { probeInstagramVideo } from './utils/probe-video.js';
import { assertLanguageCode, assertSafeRunId, sanitizeWords } from './utils/safe-input.js';
import type {
  GenerateInstagramSubtitleTrackOptions,
  GenerateInstagramSubtitleTrackResult,
} from './types.js';

/**
 * Creates only the dynamic ASS subtitle track for the already-finalized clean.
 * The caller passes the returned assPath to decorateInstagramVideo(), so the
 * subtitles are burned in the existing final encode (no extra MP4 generation).
 */
export async function prepareInstagramSubtitleTrack(
  options: GenerateInstagramSubtitleTrackOptions,
): Promise<GenerateInstagramSubtitleTrackResult> {
  const modelPath = options.modelPath ?? process.env.WHISPER_MODEL_PATH;
  if (!modelPath) {
    throw new Error('[SUBTITLE] WHISPER_MODEL_PATH is not configured and modelPath was not provided.');
  }

  const inputVideoPath = path.resolve(options.inputVideoPath);
  const rootWorkDirectory = path.resolve(options.workDirectory);
  const runDirectory = path.join(rootWorkDirectory, assertSafeRunId(options.runId ?? randomUUID()));
  const language = assertLanguageCode(options.language ?? 'ru');
  await mkdir(runDirectory, { recursive: true });

  const paths = {
    raw: path.join(runDirectory, 'whisper-word-timestamps.ndjson'),
    words: path.join(runDirectory, 'words.json'),
    blocks: path.join(runDirectory, 'blocks.json'),
    ass: path.join(runDirectory, 'subtitles.ass'),
    wordOrder: path.join(runDirectory, 'word-order.json'),
  };

  const fontFilePath = options.fontFilePath ??
    process.env.SUBTITLE_FONT_PATH ??
    path.resolve('public/instagram/fonts/Montserrat-ExtraBold.ttf');
  const videoInfo = await probeInstagramVideo(inputVideoPath, options.ffprobePath);
  // Letter size and row spacing depend on the frame shape (square vs vertical);
  // explicit options.config still wins over the format preset.
  const config = resolveSubtitleConfig(
    mergeSubtitleOverrides(
      getFormatSubtitleOverrides(videoInfo.width, videoInfo.height),
      options.config,
    ),
  );

  const transcript = await transcribeInstagramTranscript({
    inputPath: inputVideoPath,
    modelPath: path.resolve(modelPath),
    outputPath: paths.raw,
    // Keep transcription FFmpeg separate from ffmpeg-static used by the
    // existing Reel renderer. FFmpeg Whisper filter requires an FFmpeg build
    // compiled with --enable-whisper.
    ffmpegPath: options.whisperFfmpegPath,
    language,
    queueSeconds: options.queueSeconds ?? 10,
    useGpu: options.useGpu ?? false,
    maxLen: 1,
    timeoutMs: options.timeoutMs,
    context: options.context,
    preTranscribed: options.preTranscribed,
  });

  // Recogniser output is untrusted: drop broken words, clamp times to the video.
  const { words, dropped } = sanitizeWords(transcript.words, videoInfo.durationSeconds);
  if (dropped > 0) {
    console.warn('[SUBTITLE] Dropped invalid transcript words', { dropped });
  }
  const soundCues = transcript.soundCues;
  const blocks = buildInstagramSubtitleBlocks(words, config, options.keyPhrases ?? []);
  const ass = await generateInstagramSubtitleAss(
    blocks,
    videoInfo.width,
    videoInfo.height,
    config,
    soundCues,
    fontFilePath,
    {
      videoPath: inputVideoPath,
      ffmpegPath: process.env.FFMPEG_PATH,
      frameRate: videoInfo.frameRate,
      durationSeconds: videoInfo.durationSeconds,
      wordOrderReportPath: paths.wordOrder,
    },
  );

  // Use the actual maximum Dialogue end, including every glyph, glow and
  // backing tail. A hand-maintained duration formula can miss later events.
  const maximumAssEndSeconds = getMaximumDialogueEndSeconds(ass);
  const requiredVideoTailSeconds = Math.max(
    0,
    maximumAssEndSeconds - videoInfo.durationSeconds + 0.05,
  );

  await Promise.all([
    writeFile(paths.words, `${JSON.stringify(words, null, 2)}\n`, 'utf8'),
    writeFile(paths.blocks, `${JSON.stringify(blocks, null, 2)}\n`, 'utf8'),
    writeFile(path.join(runDirectory, 'sound-cues.json'), `${JSON.stringify(soundCues, null, 2)}\n`, 'utf8'),
    writeFile(paths.ass, ass, 'utf8'),
  ]);

  if (options.keepDebugArtifacts === false) {
    await Promise.all([
      rm(paths.raw, { force: true }),
      rm(paths.raw.replace(/(\.ndjson)?$/u, '.whisper-timing.ndjson'), { force: true }),
      rm(paths.words, { force: true }),
      rm(paths.blocks, { force: true }),
      rm(path.join(runDirectory, 'sound-cues.json'), { force: true }),
      rm(paths.wordOrder, { force: true }),
    ]);
  }

  const result: GenerateInstagramSubtitleTrackResult = {
    assPath: paths.ass,
    workDirectory: runDirectory,
    wordsPath: options.keepDebugArtifacts === false ? undefined : paths.words,
    blocksPath: options.keepDebugArtifacts === false ? undefined : paths.blocks,
    rawTranscriptionPath: options.keepDebugArtifacts === false ? undefined : paths.raw,
    wordOrderPath: options.keepDebugArtifacts === false ? undefined : paths.wordOrder,
    wordCount: words.length,
    blockCount: blocks.length,
    soundCueCount: soundCues.length,
    durationSeconds: videoInfo.durationSeconds,
    width: videoInfo.width,
    height: videoInfo.height,
    requiredVideoTailSeconds,
    speechWindows: blocks.map(({ start, displayEnd }) => ({ start, end: displayEnd })),
  };

  console.info('[SUBTITLE] ASS track prepared for decorateInstagramVideo()', {
    assPath: result.assPath,
    wordCount: result.wordCount,
    blockCount: result.blockCount,
    soundCueCount: result.soundCueCount,
    durationSeconds: result.durationSeconds,
    resolution: `${result.width}x${result.height}`,
    fontFilePath,
    frameRate: videoInfo.frameRate,
    wordOrderPath: result.wordOrderPath,
    requiredVideoTailSeconds: result.requiredVideoTailSeconds,
  });

  return result;
}

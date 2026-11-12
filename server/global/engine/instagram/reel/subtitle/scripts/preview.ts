import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getFormatSubtitleOverrides, resolveSubtitleConfig } from '../config.js';
import { buildInstagramSubtitleBlocks } from '../layout/build-subtitle-blocks.js';
import { generateInstagramSubtitleAss, getMaximumDialogueEndSeconds } from '../render/generate-ass.js';
import { transcribeInstagramTranscript } from '../transcription/whisper.js';
import { probeInstagramVideo } from '../utils/probe-video.js';
import type { SoundCue, WordTiming } from '../types.js';

type CliArgs = Record<string, string>;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];

    if (!item) break
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    if (key === 'help') { args.help = 'true'; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}.`);
    args[key] = value;
    index += 1;
  }
  return args;
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

type WordOrderReport = {
  frameRate: number;
  minimumGapFrames: number;
  entries: Array<{
    text: string;
    start: number;
    end: number;
    line: number;
    idx: number;
    blockIndex: number;
    firstAppearanceMs: number;
    firstAppearanceFrame: number;
  }>;
  pairChecks: Array<{
    before: string;
    after: string;
    present: boolean;
    passed: boolean;
  }>;
};

/**
 * Runs after the MP4 render. This verifies the actual frame numbers encoded
 * into the per-glyph ASS events and the explicit regression pairs. It is a
 * timing/event validation, not OCR or a pixel-recognition test.
 */
async function validateRenderedWordOrder(
  reportPath: string,
  renderedPreviewPath: string,
): Promise<void> {
  const report = JSON.parse(
    await readFile(reportPath, 'utf8'),
  ) as WordOrderReport;

  let previousFrame = Number.NEGATIVE_INFINITY;
  const violations: string[] = [];

  for (const entry of report.entries) {
    if (
      Number.isFinite(previousFrame) &&
      entry.firstAppearanceFrame < previousFrame + report.minimumGapFrames
    ) {
      violations.push(
        `${entry.text}: frame ${entry.firstAppearanceFrame} < ${previousFrame + report.minimumGapFrames}`,
      );
    }
    previousFrame = entry.firstAppearanceFrame;
  }

  for (const pair of report.pairChecks) {
    if (pair.present && !pair.passed) {
      violations.push(`${pair.before} must appear before ${pair.after}`);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `[SUBTITLE PREVIEW] Rendered word-order validation failed:\n${violations.join('\n')}`,
    );
  }

  const validation = {
    renderedPreviewPath,
    validationType: 'ASS-event-frame-order-after-render',
    passed: true,
    checkedWords: report.entries.length,
    minimumGapFrames: report.minimumGapFrames,
    frameRate: report.frameRate,
    regressionPairs: report.pairChecks,
    entries: report.entries.map(entry => ({
      text: entry.text,
      firstAppearanceFrame: entry.firstAppearanceFrame,
      firstAppearanceSeconds: entry.firstAppearanceFrame / report.frameRate,
      line: entry.line,
      idx: entry.idx,
    })),
  };

  await writeFile(
    path.join(path.dirname(reportPath), 'word-order-render-check.json'),
    `${JSON.stringify(validation, null, 2)}\n`,
    'utf8',
  );

  console.info('[SUBTITLE PREVIEW] Rendered word-order validation passed', {
    checkedWords: report.entries.length,
    minimumGapFrames: report.minimumGapFrames,
    regressionPairs: report.pairChecks,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Required: --input <video> --out-dir <directory>');
    console.log('Use --model <ggml-model.bin> for Whisper or --words-json <fixture.json> to skip transcription.');
    console.log('Use --font-file <Montserrat-ExtraBold.ttf> or SUBTITLE_FONT_PATH for exact per-glyph positioning.');
    return;
  }
  if (!args.input || !args['out-dir']) throw new Error('--input and --out-dir are required.');
  if (!args.model && !args['words-json']) throw new Error('Provide --model or --words-json.');

  const outDir = path.resolve(args['out-dir']);
  await mkdir(outDir, { recursive: true });
  const fontFilePath = path.resolve(
    args['font-file'] ??
    process.env.SUBTITLE_FONT_PATH ??
    path.join(args['fonts-dir'] ?? 'public/instagram/fonts', 'Montserrat-ExtraBold.ttf'),
  );
  const transcript = args['words-json']
    ? {
        words: JSON.parse(await readFile(args['words-json'], 'utf8')) as WordTiming[],
        soundCues: args['sound-cues-json']
          ? JSON.parse(await readFile(args['sound-cues-json'], 'utf8')) as SoundCue[]
          : [],
      }
    : await transcribeInstagramTranscript({
        inputPath: path.resolve(args.input),
        modelPath: path.resolve(args.model!),
        outputPath: path.join(outDir, 'whisper-word-timestamps.ndjson'),
        ffmpegPath: args.ffmpeg,
        language: args.language ?? 'ru',
        ...(args.queue ? {queueSeconds: Number(args.queue)} : {}),
        useGpu: args['use-gpu'] === 'true',
        maxLen: 1,
      });

  const keyPhrases = args['key-phrases']
    ? args['key-phrases'].split('|').map((phrase) => phrase.trim()).filter(Boolean)
    : [];
  const videoInfo = await probeInstagramVideo(path.resolve(args.input), args.ffprobe);
  const config = resolveSubtitleConfig(
    getFormatSubtitleOverrides(videoInfo.width, videoInfo.height),
  );
  const words = transcript.words;
  const soundCues = transcript.soundCues;
  const blocks = buildInstagramSubtitleBlocks(words, config, keyPhrases);
  const wordOrderReportPath = path.join(outDir, 'word-order.json');
  const ass = await generateInstagramSubtitleAss(
    blocks,
    videoInfo.width,
    videoInfo.height,
    config,
    soundCues,
    fontFilePath,
    {
      videoPath: path.resolve(args.input),
      ffmpegPath: args.ffmpeg ?? process.env.FFMPEG_PATH,
      frameRate: videoInfo.frameRate,
      durationSeconds: videoInfo.durationSeconds,
      wordOrderReportPath,
    },
  );
  const assPath = path.join(outDir, 'subtitles.ass');
  await writeFile(assPath, ass, 'utf8');
  await writeFile(path.join(outDir, 'words.json'), `${JSON.stringify(words, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outDir, 'blocks.json'), `${JSON.stringify(blocks, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outDir, 'sound-cues.json'), `${JSON.stringify(soundCues, null, 2)}\n`, 'utf8');

  const previewPath = path.join(outDir, 'subtitle-preview.mp4');
  const toRelativeFilterPath = (filePath: string): string => {
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(process.cwd(), absolutePath);
    if (path.isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith(`..${path.sep}`)) {
      throw new Error(`[SUBTITLE PREVIEW] Filter path must be inside the project root: ${filePath}`);
    }
    return relativePath.split(path.sep).join('/');
  };
  const fontsDir = args['fonts-dir']
    ? `:fontsdir='${toRelativeFilterPath(args['fonts-dir'])}'`
    : '';
  const assFilterPath = toRelativeFilterPath(assPath);
  const start = Math.max(0, Number(args['preview-start'] ?? 0));
  const seconds = Math.max(0.5, Number(args['preview-seconds'] ?? 5));
  // Use one frame per video frame by default so animation defects are not
  // hidden by sparse 2 fps sampling. Pass --preview-fps 2 for a contact sheet.
  const frameFps = Math.max(0.2, Number(args['preview-fps'] ?? 30));

  const maximumAssEndSeconds = getMaximumDialogueEndSeconds(ass);
  const previewTailSeconds = Math.max(
    0,
    maximumAssEndSeconds - videoInfo.durationSeconds + 0.05,
  );

  if (!Number.isFinite(start) || !Number.isFinite(seconds) || !Number.isFinite(frameFps)) {
    throw new Error('Preview start, duration and FPS must be finite numbers.');
  }

  // Pad audio with silence only when the requested preview interval
  // extends beyond the source audio duration.
  const availableAudioSeconds = Math.max(
    0,
    videoInfo.durationSeconds - start,
  );
  const audioTailSeconds = Math.max(
    0,
    seconds - availableAudioSeconds,
  );

  // The video may need a longer tail for the final subtitle exit animation.
  const videoPadSeconds = Math.max(
    previewTailSeconds,
    audioTailSeconds,
  );

  // Apply ASS before trim so subtitle timestamps remain relative to the
  // beginning of the original source video. Trimming first would reset PTS
  // and shift every absolute ASS Dialogue time.
  // tpad must precede ASS so libass can finish the final exit wave.
  const previewFilter =
    (videoPadSeconds > 0
      ? `tpad=stop_mode=clone:stop_duration=${videoPadSeconds.toFixed(3)},`
      : '') +
    `ass=filename='${assFilterPath}'${fontsDir},` +
    `trim=start=${start}:duration=${seconds},` +
    'setpts=PTS-STARTPTS';

  const audioFilter = [
    `atrim=start=${start}:duration=${seconds}`,
    'asetpts=PTS-STARTPTS',
    ...(audioTailSeconds > 0
      ? [`apad=pad_dur=${audioTailSeconds.toFixed(3)}`]
      : []),
  ].join(',');

  await run(args.ffmpeg ?? process.env.FFMPEG_PATH ?? 'ffmpeg', [
    '-hide_banner', '-nostdin', '-y',
    '-i', path.resolve(args.input),
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-vf', previewFilter,
    '-af', audioFilter,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    previewPath,
  ]);

  await validateRenderedWordOrder(
    wordOrderReportPath,
    previewPath,
  );

  const framesDir = path.join(outDir, 'frames');
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  await run(args.ffmpeg ?? process.env.FFMPEG_PATH ?? 'ffmpeg', [
    '-hide_banner', '-nostdin', '-y',
    '-i', previewPath,
    '-vf', `fps=${frameFps}`,
    '-frames:v', String(Math.ceil(seconds * frameFps)),
    path.join(framesDir, 'frame-%04d.png'),
  ]);

  console.log('[SUBTITLE PREVIEW] Completed', {
    words: words.length,
    blocks: blocks.length,
    soundCues: soundCues.length,
    resolution: `${videoInfo.width}x${videoInfo.height}`,
    frameRate: videoInfo.frameRate,
    fontFilePath,
    wordOrderReportPath,
    previewTailSeconds,
    previewPath,
    framesDir,
  });
}

main().catch((error: unknown) => {
  console.error('[SUBTITLE PREVIEW ERROR]', error);
  process.exitCode = 1;
});

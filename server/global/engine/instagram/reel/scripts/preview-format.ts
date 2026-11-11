/**
 * Локальный просмотр макета Reels. R2, Telegram, Gemini и Instagram не трогает:
 * прогоняет настоящие prepareInstagramVideo() и decorateInstagramVideo() над
 * файлом на диске и складывает результат в tmp/format/<имя запуска>/.
 *
 * Запускать из корня проекта (шрифты берутся из public/instagram/fonts):
 *
 *   node --env-file=.env --import tsx .\server\global\engine\instagram\reel\scripts\preview-format.ts `
 *     --input "D:\video\trailer.mp4" `
 *     --hook "ВЫЗВАЛИ ДУХ, НО ИГРА ЗАШЛА СЛИШКОМ ДАЛЕКО" `
 *     --name before
 *
 * Что появится в tmp/format/<name>/:
 *   clean.mp4          результат prepareInstagramVideo() (квадрат 1080x1080)
 *   reel.mp4           финальный ролик после decorateInstagramVideo()
 *   sheet-first-6s.png контактный лист первых секунд (по 2 кадра в секунду)
 *   frame-<t>s.png     кадры финального ролика в заданные моменты
 *   frame-cta-<t>s.png кадры с «Сохрани, чтобы не потерять» (середина и конец)
 *   subtitles.ass      дорожка субтитров (если дан --words-json)
 *   save-cta.ass       дорожка «Сохрани, чтобы не потерять»
 *   summary.json       тайминги этапов, размеры, ffprobe по clean и reel
 *
 * Параметры:
 *   --input <видео>        полный исходный трейлер (сегмент выбирает сам пайплайн)
 *   --clean <видео>        готовый clean 1080x1080: пропустить prepare и проверить только оформление
 *   --hook "<текст>"       хук (минимум два слова)
 *   --cta off              не добавлять «Сохрани, чтобы не потерять»
 *   --plate dark|light     подложка хука: dark чёрная с белым текстом (по умолчанию),
 *                          light чуть притемнённая белая с чёрным текстом
 *   --words-json <файл>    слова с таймингами, чтобы получить субтитры без Whisper
 *                          (пример: reel/subtitle/fixtures/words.sample.json)
 *   --sound-cues-json <файл>, --key-phrases "фраза 1|фраза 2"  по аналогии с тестами субтитров
 *   --name <имя>           подпапка запуска (по умолчанию run-<время>)
 *   --out-dir <папка>      по умолчанию tmp/format
 *   --frames "0.2,2,3.8"   моменты для отдельных кадров (по умолчанию 0.2,2,3.8,5,8)
 *   --sheet-seconds <N>    длина контактного листа (по умолчанию 6)
 *   --key <строка>         служебный ключ в именах временных файлов (по умолчанию preview)
 *   --font-file, --ffmpeg  необязательные пути, как в тестах субтитров
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import { prepareInstagramVideo } from '../utils/prepareInstagramVideo.js';
import { decorateInstagramVideo, type HookPlateStyle } from '../utils/decorateInstagramVideo.js';
import { getFormatSubtitleOverrides, resolveSubtitleConfig } from '../subtitle/config.js';
import { prepareSaveCtaTrack } from '../subtitle/cta.js';
import { buildInstagramSubtitleBlocks } from '../subtitle/layout/build-subtitle-blocks.js';
import { generateInstagramSubtitleAss } from '../subtitle/render/generate-ass.js';
import { probeInstagramVideo } from '../subtitle/utils/probe-video.js';
import type { SoundCue, WordTiming } from '../subtitle/types.js';

const execFileAsync = promisify(execFile);

type CliArgs = Record<string, string>;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item || !item.startsWith('--')) continue;
    const key = item.slice(2);
    if (key === 'help') { args.help = 'true'; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}.`);
    args[key] = value;
    index += 1;
  }
  return args;
}

/** rename не работает между дисками, тогда копируем и удаляем исходник. */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error: any) {
    if (error?.code !== 'EXDEV') throw error;
    await copyFile(from, to);
    await unlink(from);
  }
}

async function ffprobeJson(filePath: string): Promise<Record<string, unknown>> {
  try {
    const { stdout } = await execFileAsync(process.env.FFPROBE_PATH ?? 'ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries',
      'stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,bit_rate,color_space,color_range'
        + ':format=duration,size,bit_rate',
      '-of', 'json',
      filePath,
    ], { maxBuffer: 5 * 1024 * 1024 });
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch (error: any) {
    return { error: String(error?.message ?? error) };
  }
}

async function runFfmpeg(args: string[]): Promise<void> {
  if (!ffmpegPath) throw new Error('ffmpeg-static binary not found');
  await execFileAsync(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function buildSubtitleAss(
  cleanPath: string,
  outDir: string,
  args: CliArgs,
): Promise<{ assPath: string; speechWindows: Array<{ start: number; end: number }> }> {
  const fontFilePath = path.resolve(
    args['font-file']
      ?? process.env.SUBTITLE_FONT_PATH
      ?? 'public/instagram/fonts/Montserrat-ExtraBold.ttf',
  );
  const words = JSON.parse(await readFile(args['words-json']!, 'utf8')) as WordTiming[];
  const soundCues = args['sound-cues-json']
    ? JSON.parse(await readFile(args['sound-cues-json'], 'utf8')) as SoundCue[]
    : [];
  const keyPhrases = args['key-phrases']
    ? args['key-phrases'].split('|').map((phrase) => phrase.trim()).filter(Boolean)
    : [];

  const videoInfo = await probeInstagramVideo(cleanPath);
  // Same letter size and row spacing as the real pipeline for this frame shape.
  const config = resolveSubtitleConfig(
    getFormatSubtitleOverrides(videoInfo.width, videoInfo.height),
  );
  const blocks = buildInstagramSubtitleBlocks(words, config, keyPhrases);
  const ass = await generateInstagramSubtitleAss(
    blocks,
    videoInfo.width,
    videoInfo.height,
    config,
    soundCues,
    fontFilePath,
    {
      videoPath: cleanPath,
      ffmpegPath: args.ffmpeg ?? process.env.FFMPEG_PATH ?? ffmpegPath ?? undefined,
      frameRate: videoInfo.frameRate,
      durationSeconds: videoInfo.durationSeconds,
      wordOrderReportPath: path.join(outDir, 'word-order.json'),
    },
  );
  const assPath = path.join(outDir, 'subtitles.ass');
  await writeFile(assPath, ass, 'utf8');
  return {
    assPath,
    speechWindows: blocks.map(({ start, displayEnd }) => ({ start, end: displayEnd })),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.input && !args.clean)) {
    console.log('Required: --input <trailer.mp4> (or --clean <clean.mp4> to test only the decoration).');
    console.log('See the comment at the top of this file for all options and the run command.');
    return;
  }
  if (!existsSync(path.resolve('public/instagram/fonts'))) {
    throw new Error('Run this script from the project root: public/instagram/fonts was not found in the current directory.');
  }

  const key = args.key ?? 'preview';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = args.name ?? `run-${stamp}`;
  const outDir = path.resolve(args['out-dir'] ?? 'tmp/format', name);
  await mkdir(outDir, { recursive: true });

  const timings: Record<string, number> = {};
  const timed = async <T>(label: string, work: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await work();
    } finally {
      timings[label] = Date.now() - startedAt;
      console.info(`[FORMAT PREVIEW] ${label}: ${(timings[label]! / 1000).toFixed(1)} s`);
    }
  };

  // 1. clean. prepareInstagramVideo() пишет файл рядом с входным, поэтому
  //    сразу переносим результат в папку запуска и ничего не оставляем рядом с трейлером.
  const cleanPath = path.join(outDir, 'clean.mp4');
  if (args.clean) {
    const source = path.resolve(args.clean);
    if (source !== cleanPath) await copyFile(source, cleanPath);
  } else {
    const prepared = await timed('prepare (clean)', () =>
      prepareInstagramVideo(path.resolve(args.input!), key));
    await moveFile(prepared, cleanPath);
  }

  // 2. Субтитры: только из готовых слов, без Whisper и Gemini.
  const subtitleTrack = args['words-json']
    ? await timed('subtitles (ASS)', () => buildSubtitleAss(cleanPath, outDir, args))
    : undefined;
  const subtitleAssPath = subtitleTrack?.assPath;

  // 2b. «Сохрани, чтобы не потерять»: та же дорожка ASS, что и в боевом пайплайне.
  const cleanInfo = await probeInstagramVideo(cleanPath);
  const ctaTrack = args.cta === 'off'
    ? undefined
    : await timed('save CTA (ASS)', async () => {
      const track = await prepareSaveCtaTrack({
        videoPath: cleanPath,
        durationSeconds: cleanInfo.durationSeconds,
        width: cleanInfo.width,
        height: cleanInfo.height,
        frameRate: cleanInfo.frameRate,
        workDirectory: outDir,
        runId: 'cta',
        fontFilePath: args['font-file'],
        ffmpegPath: args.ffmpeg ?? process.env.FFMPEG_PATH ?? ffmpegPath ?? undefined,
        speechWindows: subtitleTrack?.speechWindows,
      });
      const assPath = path.join(outDir, 'save-cta.ass');
      await moveFile(track.assPath, assPath);
      await rm(path.dirname(track.assPath), { recursive: true, force: true });
      return { assPath, starts: track.starts };
    });

  // 3. Финальное оформление. Выходной файл пишется рядом с clean, то есть в папку запуска.
  const hook = args.hook ?? 'ВЫЗВАЛИ ДУХ, НО ИГРА ЗАШЛА СЛИШКОМ ДАЛЕКО';
  if (args.plate !== undefined && args.plate !== 'dark' && args.plate !== 'light') {
    throw new Error('--plate must be dark or light.');
  }
  const hookPlate: HookPlateStyle = args.plate === 'light' ? 'light' : 'dark';
  const decorated = await timed('decorate (final)', () =>
    decorateInstagramVideo(cleanPath, key, hook, {
      subtitleAssPath,
      ctaAssPath: ctaTrack?.assPath,
      hookPlate,
    }));
  const reelPath = path.join(outDir, 'reel.mp4');
  await moveFile(decorated, reelPath);

  // 4. Кадры и контактный лист для просмотра глазами.
  const frameTimes = (args.frames ?? '0.2,2,3.8,5,8')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const frameFiles: string[] = [];
  for (const time of frameTimes) {
    const file = `frame-${time}s.png`;
    await runFfmpeg(['-ss', String(time), '-i', reelPath, '-frames:v', '1', path.join(outDir, file)]);
    frameFiles.push(file);
  }
  // Кадры с призывом: через 2,2 с после начала показа все слова уже на экране.
  for (const start of ctaTrack?.starts ?? []) {
    const time = Number((start + 2.2).toFixed(2));
    const file = `frame-cta-${time}s.png`;
    await runFfmpeg(['-ss', String(time), '-i', reelPath, '-frames:v', '1', path.join(outDir, file)]);
    frameFiles.push(file);
  }
  const sheetSeconds = Math.max(1, Number(args['sheet-seconds'] ?? 6));
  const sheetFile = `sheet-first-${sheetSeconds}s.png`;
  const sheetColumns = 4;
  const sheetRows = Math.ceil((sheetSeconds * 2) / sheetColumns);
  await runFfmpeg([
    '-t', String(sheetSeconds),
    '-i', reelPath,
    '-vf', `fps=2,scale=400:-2,tile=${sheetColumns}x${sheetRows}`,
    '-frames:v', '1',
    path.join(outDir, sheetFile),
  ]);

  // 5. Отчёт.
  const summary = {
    input: args.input ? path.resolve(args.input) : null,
    reusedClean: args.clean ? path.resolve(args.clean) : null,
    hook,
    hookPlate,
    subtitles: subtitleAssPath ? path.basename(subtitleAssPath) : null,
    saveCta: ctaTrack ? { file: path.basename(ctaTrack.assPath), startsSeconds: ctaTrack.starts } : null,
    timingsMs: timings,
    clean: await ffprobeJson(cleanPath),
    reel: await ffprobeJson(reelPath),
    files: ['clean.mp4', 'reel.mp4', sheetFile, ...frameFiles],
  };
  await writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.info('[FORMAT PREVIEW] Done', { outDir, timingsMs: timings, files: summary.files });
}

main().catch((error) => {
  console.error('[FORMAT PREVIEW] Failed:', error);
  process.exitCode = 1;
});

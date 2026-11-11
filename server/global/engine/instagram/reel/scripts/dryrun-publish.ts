/**
 * Локальный сухой прогон публикации Reel: то же самое, что делают Cloud Run worker и финализатор,
 * но без облака. Запускается в терминале IDE, все логи видны сразу и дублируются в файл.
 *
 *   npm run reel:dryrun -- --key <id трейлера на YouTube> --title "Название" --genre "Ужасы, Триллер"
 *
 * Перед первым запуском на Windows и macOS один раз: npm run reel:setup-ytdlp (ставит yt-dlp и плагин
 * BGUtil в tmp/tools). После прогона локальный BGUtil-сервер (порт 4416) остаётся запущенным и
 * используется следующим запуском; остановить его можно завершением процесса node в диспетчере задач.
 *
 * Что настоящее: скачивание трейлера (yt-dlp), монтаж 1080x1080, Gemini-хук, субтитры (если
 * настроен Whisper), оформление, «Сохрани, чтобы не потерять», подпись для Instagram.
 *
 * Что подменено:
 *   - R2: файлы лежат в tmp/dryrun/storage (REEL_LOCAL_STORAGE_DIR), облако не трогается;
 *   - Instagram: вместо Graph API создаются файлы (INSTAGRAM_DRY_RUN), токен не нужен;
 *   - Supabase, Cloud Run и Telegram-канал не участвуют.
 *
 * Что появится в tmp/dryrun/<name>/:
 *   reel.mp4                 ролик, который ушёл бы в Instagram
 *   clean.mp4                чистая заготовка 1080x1080 без оформления
 *   caption.txt              подпись к публикации
 *   instagram-request.json   запросы, которые ушли бы в Graph API (без токена)
 *   sheet-first-6s.png, frame-<t>s.png   контактный лист и кадры для просмотра глазами
 *   subtitles/               рабочая папка субтитров (words.json, blocks.json, subtitles.ass, сырой вывод Whisper) и
 *                            transcript.txt: текст в ролике, то, что услышал Gemini, и то, что услышал Whisper, рядом по времени
 *   run.log                  весь вывод терминала (без цветовых кодов)
 *   summary.json             настройки запуска, тайминги, ffprobe, результат проверок,
 *                            borderCheck (чёрные полосы в clean.mp4), subtitles (получились ли субтитры),
 *                            source (какой формат YouTube на самом деле скачан: разрешение, клиенты yt-dlp,
 *                            число попыток) и encoded (профиль, разрешение, fps и битрейт clean и reel)
 *
 * Параметры:
 *   --key <id или ссылка>  обязателен: id YouTube-трейлера (ровно 11 символов) или ссылка на видео
 *   --id <число>           условный id фильма для имён файлов (по умолчанию 1)
 *   --type movie|tv        по умолчанию movie
 *   --content-type <тип>   movie, series, cartoon, cartoonSeries, anime (по умолчанию из --type)
 *   --title, --overview, --genre "Ужасы, Триллер", --rating 7.4, --release 2026-05-14
 *   --media-json <файл>    полный объект TMDB для подписи (заменяет перечисленное выше)
 *   --comment "<текст>"    комментарий редактора для подписи
 *   --hook "<текст>"       запасной хук (основной придумывает Gemini)
 *   --transcription gemini|whisper   чем распознавать речь для субтитров, по умолчанию gemini (значение
 *                          REEL_SUBTITLE_TRANSCRIPTION_PROVIDER из .env на этот запуск не действует). gemini: слова и времена от
 *                          Gemini (gemini-3.5-transcribe), привязка времён к Whisper (если слова совпали), проверка текста,
 *                          перевод иностранной речи, определение говорящих. Нужен GEMINI_API_KEY
 *   --gemini-timing whisper|gemini   чьи времена слов брать при gemini. Без параметра как в проекте: whisper, а если слова
 *                          Gemini и Whisper расходятся, то времена Gemini. gemini: Whisper не запускается вообще
 *   --whisper-fallback     при сбое Gemini перейти на Whisper (без флага сбой остаётся виден: субтитров не будет)
 *   --subtitles on|off     по умолчанию как REEL_SUBTITLES_ENABLED. При on модель берётся из
 *                          WHISPER_MODEL_PATH, а если путь не задан или неверен, из server/models/ggml-small.bin.
 *                          ffmpeg с фильтром whisper: WHISPER_FFMPEG_PATH или ffmpeg из PATH (сборка full от gyan.dev)
 *   --reuse                не очищать tmp/dryrun/storage: clean из прошлого запуска будет использован
 *                          повторно (быстрее, но изменения этапа монтажа не будут видны)
 *   --name <имя>           подпапка запуска (по умолчанию run-<время>)
 *   --out-dir <папка>      по умолчанию tmp/dryrun
 *   --frames "0.5,3,6,mid,end"   моменты для кадров (mid = середина, end = за секунду до конца)
 *   --no-frames            без кадров и контактного листа
 *   --no-cookies           не передавать YouTube cookies (YOUTUBE_COOKIES_B64 из .env на этот запуск игнорируется)
 *   --skip-preflight       не останавливаться на проверке окружения
 */
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

type CliArgs = Record<string, string>;

const FLAG_ARGS = new Set(['help', 'reuse', 'no-frames', 'skip-preflight', 'no-cookies', 'whisper-fallback']);
const TAG = '[DRYRUN]';

// Куда записать summary.json, если прогон упал после создания папки запуска.
let failureSummaryPath: string | undefined;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item || !item.startsWith('--')) continue;
    const key = item.slice(2);
    if (FLAG_ARGS.has(key)) { args[key] = 'true'; continue; }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}.`);
    args[key] = value;
    index += 1;
  }
  return args;
}

// ---------------------------------------------------------------------------------------------
// Лог: терминал + файл
// ---------------------------------------------------------------------------------------------

const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;

/** Всё, что выводится в терминал (console.* и прямые записи), дублируется в файл без цветов. */
function teeTerminalToFile(logPath: string): void {
  const wrap = (original: (...args: any[]) => boolean) =>
    (chunk: any, ...rest: any[]): boolean => {
      try {
        const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        appendFileSync(logPath, text.replace(ANSI_PATTERN, ''));
      } catch {
        // Лог в файл вспомогательный: из-за него прогон не должен падать.
      }
      return original(chunk, ...rest);
    };
  (process.stdout as any).write = wrap(process.stdout.write.bind(process.stdout));
  (process.stderr as any).write = wrap(process.stderr.write.bind(process.stderr));
}

const info = (message: string, details?: unknown): void => {
  if (details === undefined) console.info(`${TAG} ${message}`);
  else console.info(`${TAG} ${message}`, details);
};

// ---------------------------------------------------------------------------------------------
// ffprobe / ffmpeg
// ---------------------------------------------------------------------------------------------

const ffprobeBinary = (): string => process.env.FFPROBE_PATH ?? 'ffprobe';

async function ffprobeJson(filePath: string): Promise<Record<string, any>> {
  try {
    const { stdout } = await execFileAsync(ffprobeBinary(), [
      '-v', 'error',
      '-show_entries',
      'stream=index,codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,bit_rate,color_space,color_range'
        + ':format=duration,size,bit_rate',
      '-of', 'json',
      filePath,
    ], { maxBuffer: 5 * 1024 * 1024 });
    return JSON.parse(stdout) as Record<string, any>;
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

// ---------------------------------------------------------------------------------------------
// Проверка окружения до запуска: что есть на этой машине, чего не хватает
// ---------------------------------------------------------------------------------------------

type Check = { level: 'OK' | 'WARN' | 'FAIL' | 'INFO'; name: string; detail: string };

/** Описание значения YOUTUBE_COOKIES_B64 без показа содержимого: только длины и признаки формата. */
function describeCookieValue(raw: string): string {
  const parts: string[] = [`длина значения ${raw.length} символов`];
  if (/^["'][\s\S]*["']$/.test(raw)) parts.push('значение в кавычках: кавычки попали в значение');
  const compact = raw.replace(/\s+/g, '');
  if (compact.length !== raw.length) parts.push('внутри есть пробелы или переносы строк');
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) {
    parts.push('это не base64 и не текст cookies.txt');
    return parts.join('; ');
  }
  const bytes = Buffer.from(compact, 'base64');
  parts.push(`после декодирования ${bytes.length} байт`);
  if (bytes.length < 200) {
    parts.push('для файла cookies это очень мало (обычно килобайты): значение обрезано или это заглушка');
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    parts.push('кодировка UTF-16 LE: сохраните cookies.txt в UTF-8 и закодируйте заново');
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    parts.push('кодировка UTF-16 BE: сохраните cookies.txt в UTF-8 и закодируйте заново');
  } else if (bytes[0] === 0x5b || bytes[0] === 0x7b) {
    parts.push('похоже на JSON, а нужен Netscape cookies.txt (первая строка # Netscape HTTP Cookie File)');
  }
  return parts.join('; ');
}

/** Если yt-dlp не задан через YTDLP_PATH и его нет в media-tools, берём tmp/tools (его ставит reel:setup-ytdlp). */
function resolveLocalYtDlp(): void {
  if (process.env.YTDLP_PATH?.trim()) return;
  const executable = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  if (existsSync(path.resolve('media-tools', executable))) return;
  const localBinary = path.resolve('tmp/tools', executable);
  if (existsSync(localBinary)) process.env.YTDLP_PATH = localBinary;
}

/**
 * На Windows и macOS yt-dlp в проекте нет (media-tools содержит Linux-бинарник). Если его не нашли,
 * ставим сами тем же скриптом, что и `npm run reel:setup-ytdlp` (версия закреплена, контрольная сумма
 * проверяется), и повторяем поиск. Папка tmp может быть очищена, поэтому установка повторяется сама.
 */
async function ensureLocalYtDlp(): Promise<void> {
  resolveLocalYtDlp();
  if (process.env.YTDLP_PATH?.trim() || process.platform === 'linux') return;
  const executable = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  if (existsSync(path.resolve('media-tools', executable))) return;
  const setupScript = path.resolve('scripts/setupLocalYtDlp.mjs');
  if (!existsSync(setupScript)) return;

  info('yt-dlp not found: installing it into tmp/tools (the same as npm run reel:setup-ytdlp)');
  const print = (text: string, write: (message: string) => void) => {
    for (const line of text.split(/\r?\n/).filter(Boolean)) write(`  ${line}`);
  };
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [setupScript], {
      maxBuffer: 5 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    });
    print(`${stdout}${stderr}`, console.info);
  } catch (error: any) {
    print(`${error?.stdout ?? ''}${error?.stderr ?? ''}${error?.stdout || error?.stderr ? '' : String(error?.message ?? error)}`, console.error);
  }
  resolveLocalYtDlp();
}

const DEFAULT_WHISPER_MODEL = 'server/models/ggml-small.bin';

/** Для запуска с субтитрами: берём модель проекта, если WHISPER_MODEL_PATH не задан или файла по нему нет. */
function applyWhisperDefaults(): string[] {
  const notes: string[] = [];
  const configured = process.env.WHISPER_MODEL_PATH?.trim();
  if (configured && existsSync(path.resolve(configured))) return notes;

  const fallback = path.resolve(DEFAULT_WHISPER_MODEL);
  if (existsSync(fallback)) {
    process.env.WHISPER_MODEL_PATH = fallback;
    notes.push(
      configured
        ? `WHISPER_MODEL_PATH из .env (${configured}) не найден, взята модель проекта: ${fallback}`
        : `WHISPER_MODEL_PATH не задан, взята модель проекта: ${fallback}`,
    );
  }
  return notes;
}

/** Получились ли субтитры: prepareReel не останавливается при их сбое, поэтому смотрим по логу запуска. */
async function readSubtitleOutcome(logPath: string): Promise<{ result: 'ready' | 'failed' | 'unknown'; detail: string }> {
  let text = '';
  try {
    text = await readFile(logPath, 'utf8');
  } catch {
    return { result: 'unknown', detail: 'run.log не прочитан' };
  }
  const lines = text.split(/\r?\n/);
  const failedAt = lines.findIndex((line) => line.includes('[SUBTITLE GENERATION FAILED]'));
  if (failedAt >= 0) {
    const geminiFailedAt = lines.findIndex((line) => line.includes('[GEMINI TRANSCRIBE FAILED]'));
    const geminiDetail = geminiFailedAt >= 0 ? `\n${lines.slice(geminiFailedAt, geminiFailedAt + 6).join('\n')}` : '';
    return { result: 'failed', detail: `${lines.slice(failedAt, failedAt + 12).join('\n')}${geminiDetail}` };
  }
  const readyAt = lines.findIndex((line) => line.includes('[SUBTITLE TRACK READY]'));
  if (readyAt >= 0) return { result: 'ready', detail: lines.slice(readyAt, readyAt + 8).join('\n') };
  return { result: 'unknown', detail: 'в логе нет ни [SUBTITLE TRACK READY], ни [SUBTITLE GENERATION FAILED]' };
}

type ReportWord = {
  text: string;
  start: number;
  end: number;
  speaker?: string;
  language?: string;
  sourceLanguage?: string;
};

type TranscriptStats = {
  finalWords: number;
  geminiWords: number | null;
  whisperWords: number | null;
  /** Языки речи: по словам Gemini до перевода, а без них по пометкам слов в ролике. */
  languages: Record<string, number>;
  speakers: number;
};

/** Заполняется колбэком onSubtitleTrackReady, пока рабочая папка субтитров ещё не удалена. */
let transcriptStats: TranscriptStats | null = null;

function formatClock(seconds: number): string {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${(total - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

/** Слова в строки: новая строка при паузе больше 0,9 с, смене говорящего, конце предложения или после 16 слов. */
function groupWordsIntoLines(words: ReportWord[]): string[] {
  const lines: string[] = [];
  let current: ReportWord[] = [];
  const flush = () => {
    const first = current[0];
    const last = current[current.length - 1];
    if (!first || !last) return;
    const speaker = first.speaker ? `${first.speaker}: ` : '';
    lines.push(`[${formatClock(first.start)} – ${formatClock(last.end)}] ${speaker}${current.map((word) => word.text).join(' ')}`);
    current = [];
  };
  for (const word of words) {
    const previous = current[current.length - 1];
    if (
      previous
      && (word.start - previous.end > 0.9
        || (word.speaker ?? '') !== (previous.speaker ?? '')
        || current.length >= 16
        || /[.!?…]$/u.test(previous.text))
    ) {
      flush();
    }
    current.push(word);
  }
  flush();
  return lines;
}

async function readJsonWords(file: string): Promise<ReportWord[] | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item): item is ReportWord => typeof item?.text === 'string' && Number.isFinite(item.start) && Number.isFinite(item.end),
    );
  } catch {
    return null;
  }
}

function countLanguages(words: ReportWord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const word of words) {
    const key = word.sourceLanguage ?? word.language ?? 'не указан';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * transcript.txt: один и тот же ролик глазами трёх этапов. «В ролике» это итог (то, что вшито в картинку),
 * «Gemini» это услышанное до проверки и перевода (язык оригинала), «Whisper» это его проход для привязки времён.
 */
async function writeTranscriptReport(directory: string, provider: string, timing: string): Promise<void> {
  const finalWords = (await readJsonWords(path.join(directory, 'words.json'))) ?? [];
  const geminiWords = provider === 'gemini'
    ? await readJsonWords(path.join(directory, 'whisper-word-timestamps.gemini-original.json'))
    : null;

  let whisperWords: ReportWord[] | null = null;
  if (provider === 'gemini') {
    try {
      const { parseWhisperTranscriptNdjson } = await import('#server/global/engine/instagram/reel/subtitle');
      const raw = await readFile(path.join(directory, 'whisper-word-timestamps.whisper-timing.ndjson'), 'utf8');
      whisperWords = parseWhisperTranscriptNdjson(raw).words;
    } catch {
      whisperWords = null; // Whisper не запускался (--gemini-timing gemini) или не дал слов
    }
  }

  const counts = [
    `в ролике ${finalWords.length}`,
    geminiWords ? `у Gemini до обработки ${geminiWords.length}` : null,
    whisperWords ? `у Whisper (проход привязки времён) ${whisperWords.length}` : null,
  ].filter(Boolean).join(', ');

  const section = (title: string, words: ReportWord[] | null, empty: string) => [
    '',
    `=== ${title} ===`,
    ...(words && words.length > 0 ? groupWordsIntoLines(words) : [empty]),
  ];

  const text = [
    `Транскрипт сухого прогона. Распознавание: ${provider}${provider === 'gemini' ? `, времена слов: ${timing}` : ''}.`,
    `Слов: ${counts}.`,
    ...section('В ролике: то, что видит зритель (после проверки, перевода и привязки ко времени голоса)', finalWords, '(слов нет)'),
    ...(provider === 'gemini'
      ? [
        ...section('Gemini: что услышал (язык оригинала, до проверки и перевода)', geminiWords, '(файл не найден: Gemini не вернул слов)'),
        ...section(
          'Whisper: что услышал при привязке времён (для сравнения)',
          whisperWords,
          '(проход не запускался или слов не нашёл)',
        ),
      ]
      : []),
    '',
  ].join('\n');

  await writeFile(path.join(directory, 'transcript.txt'), text, 'utf8');

  transcriptStats = {
    finalWords: finalWords.length,
    geminiWords: geminiWords ? geminiWords.length : null,
    whisperWords: whisperWords ? whisperWords.length : null,
    languages: countLanguages(geminiWords ?? finalWords),
    speakers: new Set(finalWords.map((word) => word.speaker).filter(Boolean)).size,
  };
}

/** Копия рабочей папки субтитров в папку запуска: prepareReel удалит оригинал в конце. */
async function saveSubtitleArtifacts(workDirectory: string, destination: string, provider: string, timing: string): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  await cp(workDirectory, destination, { recursive: true });
  await writeTranscriptReport(destination, provider, timing);
}

type SourceOutcome = {
  found: boolean;
  attempts: number;
  clients?: string;
  width?: number;
  height?: number;
  tier?: number;
  format?: string;
  codec?: string;
  fps?: string;
  dynamicRange?: string;
  hiddenFormats?: boolean;
  detail?: string;
};

/** Какой трейлер скачан: downloadTrailer пишет итог строкой «[TRAILER SOURCE] FINAL {json}». */
async function readSourceOutcome(logPath: string): Promise<SourceOutcome> {
  let text = '';
  try {
    text = await readFile(logPath, 'utf8');
  } catch {
    return { found: false, attempts: 0, detail: 'run.log не прочитан' };
  }
  const lines = text.split(/\r?\n/);
  const attempts = lines.filter((line) => /\[TRAILER SOURCE\] \{/.test(line)).length;
  const finalLine = [...lines].reverse().find((line) => line.includes('[TRAILER SOURCE] FINAL {'));
  if (!finalLine) {
    return { found: false, attempts, detail: 'в логе нет строки [TRAILER SOURCE] FINAL (трейлер не скачивался или скачивание упало)' };
  }
  try {
    const parsed = JSON.parse(finalLine.slice(finalLine.indexOf('{'))) as Record<string, any>;
    return {
      found: true,
      attempts,
      clients: parsed.clients,
      width: Number(parsed.width),
      height: Number(parsed.height),
      tier: Number(parsed.tier),
      format: parsed.format,
      codec: parsed.codec,
      fps: parsed.fps,
      dynamicRange: parsed.dynamicRange,
      hiddenFormats: Boolean(parsed.hiddenFormats),
    };
  } catch {
    return { found: false, attempts, detail: `не удалось разобрать: ${finalLine.slice(0, 200)}` };
  }
}

/** Короткое описание видеопотока из ffprobeJson: профиль кодека, размер, fps, битрейт. */
function describeVideoStream(probe: Record<string, any>): Record<string, unknown> {
  const stream = (probe.streams as Record<string, any>[] | undefined)?.find((item) => item.codec_type === 'video');
  if (!stream) return { error: probe.error ?? 'нет видеопотока' };
  const [numerator, denominator] = String(stream.r_frame_rate ?? '').split('/').map(Number);
  const fps = numerator && denominator ? Number((numerator / denominator).toFixed(2)) : null;
  const bitRate = Number(stream.bit_rate ?? probe.format?.bit_rate ?? 0);
  return {
    codec: stream.codec_name,
    profile: stream.profile,
    size: `${stream.width}x${stream.height}`,
    fps,
    pixFmt: stream.pix_fmt,
    bitrateMbps: bitRate > 0 ? Number((bitRate / 1_000_000).toFixed(2)) : null,
  };
}

type TranscriptionProvider = 'gemini' | 'whisper';

async function runPreflight(
  subtitlesOn: boolean,
  subtitlesRequired: boolean,
  cookiesDisabled: boolean,
  provider: TranscriptionProvider,
  geminiTiming: string,
): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (level: Check['level'], name: string, detail: string) => checks.push({ level, name, detail });

  if (process.env.VERCEL === '1' || process.env.CLOUD_RUN_JOB || process.env.K_SERVICE) {
    add('FAIL', 'среда', 'похоже на Vercel или Cloud Run: сухой прогон запускается только на локальной машине');
  }

  for (const font of ['Oswald-Bold.ttf', 'Montserrat-ExtraBold.ttf']) {
    const fontPath = path.resolve('public/instagram/fonts', font);
    if (existsSync(fontPath)) add('OK', `шрифт ${font}`, fontPath);
    else add('FAIL', `шрифт ${font}`, `не найден: ${fontPath}. Запускайте из корня проекта`);
  }

  if (ffmpegPath && existsSync(ffmpegPath)) add('OK', 'ffmpeg-static', ffmpegPath);
  else add('FAIL', 'ffmpeg-static', 'бинарник не найден: переустановите зависимости (npm ci)');

  try {
    const { stdout } = await execFileAsync(ffprobeBinary(), ['-version']);
    add('OK', 'ffprobe', `${ffprobeBinary()}: ${stdout.split('\n')[0]?.trim()}`);
  } catch {
    add('FAIL', 'ffprobe', `не запускается (${ffprobeBinary()}). Установите ffmpeg или задайте FFPROBE_PATH в .env`);
  }

  const mode = process.env.YTDLP_BGUTIL_MODE?.trim();

  try {
    const { getYtDlpPath } = await import('#server/global/engine/instagram/scripts-yt-bgutil/ytDlp');
    const ytDlpPath = getYtDlpPath();
    try {
      const { stdout } = await execFileAsync(ytDlpPath, ['--version']);
      add('OK', 'yt-dlp', `${ytDlpPath} (версия ${stdout.trim()})`);
    } catch (error: any) {
      add('FAIL', 'yt-dlp', `${ytDlpPath} не запускается: ${String(error?.message ?? error).split('\n')[0]}`);
    }
    if (mode === 'http') {
      const plugin = path.join(
        path.dirname(ytDlpPath),
        'yt-dlp-plugins/bgutil-ytdlp-pot-provider/yt_dlp_plugins/extractor/getpot_bgutil_http.py',
      );
      if (existsSync(plugin)) add('OK', 'плагин BGUtil для yt-dlp', plugin);
      else {
        add(
          'WARN',
          'плагин BGUtil для yt-dlp',
          'рядом с yt-dlp его нет: если плагин не установлен в самом yt-dlp, YouTube может не отдать видео. Выполните npm run reel:setup-ytdlp',
        );
      }
    }
  } catch (error: any) {
    add('FAIL', 'yt-dlp', `${String(error?.message ?? error)}. Выполните: npm run reel:setup-ytdlp`);
  }
  if (mode === 'http') {
    const bgutilMain = path.resolve('bgutil-ytdlp-pot-provider/server/build/main.js');
    if (existsSync(bgutilMain)) add('OK', 'BGUtil (http)', `локальный сервер запустится сам: ${bgutilMain}`);
    else add('FAIL', 'BGUtil (http)', `не найден ${bgutilMain}`);
  } else if (mode === 'script') {
    add('INFO', 'BGUtil (script)', 'режим script рассчитан на Vercel/контейнер; локально обычно нужен http');
  } else {
    add('FAIL', 'YTDLP_BGUTIL_MODE', 'не задан (локально http). Скрипт подставит http, если запускали без .env');
  }

  const cookiesValue = process.env.YOUTUBE_COOKIES_B64?.trim();
  if (cookiesDisabled) {
    add('INFO', 'YouTube cookies', 'отключены флагом --no-cookies: трейлер скачивается без входа в аккаунт');
  } else if (!cookiesValue) {
    add('INFO', 'YouTube cookies', 'не заданы (нужны, только если YouTube просит войти)');
  } else {
    // Та же проверка, что выполняет yt-dlp-обёртка перед скачиванием (без показа значения).
    try {
      const { decodeYoutubeCookies } = await import('#server/global/engine/instagram/scripts-yt-bgutil/ytDlp');
      const text = decodeYoutubeCookies(cookiesValue);
      const count = text.split('\n').filter((line) => line && !line.startsWith('#')).length;
      add('OK', 'YouTube cookies', `YOUTUBE_COOKIES_B64 корректен, cookies: ${count}`);
    } catch (error: any) {
      add(
        'FAIL',
        'YouTube cookies',
        `${String(error?.message ?? error)}. ${describeCookieValue(cookiesValue)}. `
        + 'Исправьте YOUTUBE_COOKIES_B64 в .env или запустите с --no-cookies',
      );
    }
  }

  if (process.env.GEMINI_API_KEY?.trim()) add('OK', 'GEMINI_API_KEY', 'задан');
  else add('WARN', 'GEMINI_API_KEY', 'не задан: хук возьмётся из --hook, субтитры и перевод не заработают');

  if (subtitlesOn) {
    // Явный --subtitles on: без рабочей транскрипции прогон бессмысленен, останавливаемся (иначе получится ролик без субтитров).
    const problem: Check['level'] = subtitlesRequired ? 'FAIL' : 'WARN';
    const geminiProvider = provider === 'gemini';
    const whisperForTiming = geminiProvider && geminiTiming === 'whisper';
    const whisperNeeded = !geminiProvider || whisperForTiming;

    if (geminiProvider) {
      if (process.env.GEMINI_API_KEY?.trim()) {
        add(
          'OK',
          'транскрипция',
          `Gemini (gemini-3.5-transcribe), времена слов: ${geminiTiming}, `
          + (process.env.REEL_SUBTITLE_TRANSCRIPTION_FALLBACK === 'whisper' ? 'при сбое перейдёт на Whisper' : 'без перехода на Whisper'),
        );
      } else {
        add(problem, 'транскрипция', 'выбран Gemini, но GEMINI_API_KEY не задан (или запустите с --transcription whisper)');
      }
    } else {
      add('INFO', 'транскрипция', 'Whisper (локальная модель)');
    }

    // ffmpeg нужен любому распознаванию: звук для Gemini, анализ голоса, определение говорящих.
    const whisperFfmpeg = process.env.WHISPER_FFMPEG_PATH?.trim() || 'ffmpeg';
    let ffmpegFilters: string | undefined;
    try {
      const { stdout, stderr } = await execFileAsync(whisperFfmpeg, ['-hide_banner', '-filters'], {
        maxBuffer: 5 * 1024 * 1024,
      });
      ffmpegFilters = `${stdout}\n${stderr}`;
      add('OK', 'ffmpeg для звука (транскрипция, анализ голоса)', whisperFfmpeg);
    } catch {
      add(problem, 'ffmpeg для звука (транскрипция, анализ голоса)', `не запускается (${whisperFfmpeg}): установите ffmpeg или задайте WHISPER_FFMPEG_PATH`);
    }

    if (whisperNeeded) {
      // Основной распознаватель: сбой блокирует прогон. Только привязка времён: сбой не страшен, возьмутся времена Gemini.
      const whisperLevel: Check['level'] = geminiProvider ? 'WARN' : problem;
      const whisperConsequence = geminiProvider ? ' Без Whisper времена слов возьмутся у Gemini (хуже, к концу ролика они уходят раньше голоса).' : '';

      const model = process.env.WHISPER_MODEL_PATH?.trim();
      if (model && existsSync(path.resolve(model))) add('OK', 'Whisper-модель', path.resolve(model));
      else add(whisperLevel, 'Whisper-модель', `файла нет (${model ?? 'WHISPER_MODEL_PATH не задан'}): положите ggml-small.bin в server/models или задайте WHISPER_MODEL_PATH.${whisperConsequence}`);

      if (ffmpegFilters !== undefined) {
        const hasWhisper = ffmpegFilters.split(/\r?\n/).some((line) => /^\s*\S+\s+whisper\s+A->A(?:\s|$)/i.test(line));
        if (hasWhisper) add('OK', 'ffmpeg с фильтром whisper', whisperFfmpeg);
        else {
          add(
            whisperLevel,
            'ffmpeg с фильтром whisper',
            `${whisperFfmpeg} запускается, но фильтра whisper в нём нет. Нужна сборка FFmpeg 8 или новее с --enable-whisper `
            + '(на Windows: «full» с gyan.dev, у «essentials» фильтра нет). Путь к ней задайте в WHISPER_FFMPEG_PATH.'
            + whisperConsequence,
          );
        }
      }
    } else {
      add('INFO', 'Whisper', 'не используется: --gemini-timing gemini');
    }

    try {
      createRequire(import.meta.url).resolve('fontkit');
      add('OK', 'fontkit', 'установлен');
    } catch {
      add(problem, 'fontkit', 'не установлен: выполните npm install');
    }
  } else {
    add('INFO', 'субтитры', 'выключены (--subtitles off или REEL_SUBTITLES_ENABLED не true): ролик будет без субтитров фильма');
  }

  return checks;
}

// ---------------------------------------------------------------------------------------------
// Подпись
// ---------------------------------------------------------------------------------------------

type MediaInput = {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  overview?: string;
  genre?: string;
  rating?: number;
  release?: string;
};

function buildMedia(input: MediaInput): Record<string, any> {
  const genres = (input.genre ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name, index) => ({ id: index + 1, name }));
  return {
    id: input.id,
    media_type: input.type,
    ...(input.type === 'tv' ? { name: input.title, first_air_date: input.release } : { title: input.title, release_date: input.release }),
    overview: input.overview,
    vote_average: input.rating,
    genres,
  };
}

// ---------------------------------------------------------------------------------------------

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.key) {
    console.log('Required: --key <YouTube trailer id>. See the comment at the top of this file for all options.');
    return args.help ? 0 : 1;
  }

  const type = args.type ?? 'movie';
  if (type !== 'movie' && type !== 'tv') throw new Error('--type must be movie or tv.');
  const mediaId = Number(args.id ?? 1);
  if (!Number.isSafeInteger(mediaId) || mediaId <= 0) throw new Error('--id must be a positive integer.');
  const contentType = args['content-type'] ?? (type === 'tv' ? 'series' : 'movie');
  if (args.subtitles !== undefined && args.subtitles !== 'on' && args.subtitles !== 'off') {
    throw new Error('--subtitles must be on or off.');
  }
  const transcription = args.transcription ?? 'gemini';
  if (transcription !== 'gemini' && transcription !== 'whisper') {
    throw new Error('--transcription must be gemini or whisper.');
  }
  if (args['gemini-timing'] !== undefined && args['gemini-timing'] !== 'whisper' && args['gemini-timing'] !== 'gemini') {
    throw new Error('--gemini-timing must be whisper or gemini.');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runName = args.name ?? `run-${stamp}`;
  const outRoot = path.resolve(args['out-dir'] ?? 'tmp/dryrun');
  const runDir = path.join(outRoot, runName);
  const storageDir = path.join(outRoot, 'storage');

  await mkdir(runDir, { recursive: true });
  const logPath = path.join(runDir, 'run.log');
  await writeFile(logPath, '', 'utf8'); // при повторном --name лог прошлого запуска не должен попасть в разбор
  failureSummaryPath = path.join(runDir, 'summary.json');
  teeTerminalToFile(logPath);

  // Окружение задаём до загрузки модулей пайплайна: хранилище и публикация читают его при импорте.
  process.env.REEL_LOCAL_STORAGE_DIR = storageDir;
  process.env.INSTAGRAM_DRY_RUN = 'true';
  process.env.INSTAGRAM_DRY_RUN_DIR = runDir;
  if (!process.env.YTDLP_BGUTIL_MODE?.trim()) process.env.YTDLP_BGUTIL_MODE = 'http';

  // Распознавание речи для субтитров: выбор этого запуска важнее значений из .env. Запасной переход на
  // Whisper по умолчанию выключен, иначе сбой Gemini остался бы незамеченным (ролик получился бы со словами Whisper).
  process.env.REEL_SUBTITLE_TRANSCRIPTION_PROVIDER = transcription;
  process.env.REEL_SUBTITLE_TRANSCRIPTION_FALLBACK = transcription === 'gemini' && args['whisper-fallback'] ? 'whisper' : 'none';
  if (args['gemini-timing']) process.env.REEL_SUBTITLE_GEMINI_TIMING = args['gemini-timing'];
  const geminiTiming = (process.env.REEL_SUBTITLE_GEMINI_TIMING ?? 'whisper').trim().toLowerCase();

  if (!args.reuse) {
    // Папка хранилища всегда внутри out-dir и называется storage: чужое здесь не удаляется.
    await rm(storageDir, { recursive: true, force: true });
  }
  await mkdir(storageDir, { recursive: true });

  const subtitlesOn = args.subtitles
    ? args.subtitles === 'on'
    : process.env.REEL_SUBTITLES_ENABLED === 'true';

  info('Start', { runDir, storageDir, reuseStorage: Boolean(args.reuse), cwd: process.cwd(), node: process.version });
  info('Run: R2 is replaced by a local folder, Instagram is replaced by files. Supabase, Cloud Run and Telegram are not used.');

  // Ключ трейлера: id из 11 символов или ссылка. Проверяем до долгих шагов.
  const { extractYouTubeVideoId } = await import('#server/global/engine/instagram/reel/utils/extractYouTubeVideoId');
  const trailerKey = extractYouTubeVideoId(args.key);
  if (!trailerKey) {
    console.error(
      `${TAG} Invalid --key "${args.key}" (${args.key.length} chars). `
      + 'Need a YouTube video id of exactly 11 characters (letters, digits, - and _) or a full YouTube link. '
      + 'Check that the id is complete and that there is a space between --key <id> and the next option.',
    );
    await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify({ failed: true, error: `invalid --key: ${args.key}` }, null, 2)}\n`, 'utf8');
    return 1;
  }

  await ensureLocalYtDlp();
  const cookiesDisabled = Boolean(args['no-cookies']);
  if (cookiesDisabled) delete process.env.YOUTUBE_COOKIES_B64;
  if (subtitlesOn) {
    for (const note of applyWhisperDefaults()) info(note);
  }
  const checks = await runPreflight(subtitlesOn, args.subtitles === 'on', cookiesDisabled, transcription, geminiTiming);
  info('Environment check:');
  for (const check of checks) console.info(`  ${check.level.padEnd(4)} ${check.name}: ${check.detail}`);
  const failed = checks.filter((check) => check.level === 'FAIL');
  if (failed.length > 0 && !args['skip-preflight']) {
    console.error(`${TAG} Stopped: ${failed.length} blocking problem(s) above. Fix them or run with --skip-preflight.`);
    await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify({ stoppedByPreflight: true, checks }, null, 2)}\n`, 'utf8');
    return 1;
  }

  const hook = args.hook ?? 'ТЕСТОВЫЙ ХУК ДЛЯ ПРОВЕРКИ МАКЕТА';
  const title = args.title ?? 'Тестовый фильм';
  const content = {
    id: mediaId,
    type,
    title,
    overview: args.overview,
    genre: args.genre,
    rating: args.rating,
  };

  // Пайплайн грузим только сейчас: хранилище и публикация уже видят нужные переменные окружения.
  const { prepareReel } = await import('#server/global/engine/instagram/reel/prepareReel');
  const { publishInstagramReel } = await import('#server/global/publishers/instagram/publishInstagramReel');

  const startedAt = Date.now();
  let generatedHook: string | null = null;

  info('Preparing the reel (the same prepareReel as in the worker)');
  const prepared = await prepareReel(trailerKey, hook, content, {
    generateSubtitles: args.subtitles ? args.subtitles === 'on' : undefined,
    // Рабочую папку субтитров prepareReel удаляет в конце: забираем из неё транскрипт до этого.
    keepSubtitleDebugArtifacts: true,
    onSubtitleTrackReady: async (track: { workDirectory: string }) => {
      await saveSubtitleArtifacts(track.workDirectory, path.join(runDir, 'subtitles'), transcription, geminiTiming);
    },
    onHookGenerated: (value: string) => {
      generatedHook = value;
      info('Gemini hook', value);
    },
  });
  const prepareReelMs = Date.now() - startedAt;
  info('prepareReel finished', { seconds: Number((prepareReelMs / 1000).toFixed(1)), prepared });

  const reelUrl = String(prepared?.reelR2 ?? '');
  const cleanUrl = String(prepared?.cleanR2 ?? '');
  if (!reelUrl.startsWith('file:') || !cleanUrl.startsWith('file:')) {
    throw new Error(`Local storage did not return file:// links (reel: ${reelUrl}, clean: ${cleanUrl}). Is REEL_LOCAL_STORAGE_DIR applied?`);
  }

  // Подпись: тот же createInstagramCaption, что вызывает финализатор.
  let caption: string;
  let captionNote: string | null = null;
  try {
    const { createInstagramCaption } = await import('#server/global/engine/instagram/reel/caption/createInstagramCaption');
    const media = args['media-json']
      ? JSON.parse(await readFile(path.resolve(args['media-json']), 'utf8')) as Record<string, any>
      : buildMedia({
        id: mediaId,
        type,
        title,
        overview: args.overview,
        genre: args.genre,
        rating: args.rating !== undefined ? Number(args.rating) : undefined,
        release: args.release,
      });
    caption = createInstagramCaption({
      media,
      comment: args.comment,
      overview: args.overview,
      contentType,
    });
  } catch (error: any) {
    captionNote = `createInstagramCaption failed: ${String(error?.message ?? error)}`;
    console.error(`${TAG} ${captionNote}`);
    caption = `[dry-run placeholder caption] ${title}`;
  }

  // Публикация: INSTAGRAM_DRY_RUN складывает reel.mp4, caption.txt и instagram-request.json в runDir.
  const publishStartedAt = Date.now();
  const instagram = await publishInstagramReel({ videoUrl: reelUrl, caption });
  const publishMs = Date.now() - publishStartedAt;
  info('Instagram dry run done', instagram);

  const cleanPath = path.join(runDir, 'clean.mp4');
  await copyFile(fileURLToPath(cleanUrl), cleanPath);
  const reelPath = path.join(runDir, 'reel.mp4');

  // Чёрные полосы: независимая проверка готового clean.mp4 (по 12 кадрам всей длины).
  let borderCheck: Record<string, unknown> | null = null;
  try {
    const { checkBlackBorders } = await import('#server/global/engine/instagram/reel/utils/prepareInstagramVideo');
    const result = await checkBlackBorders(cleanPath);
    borderCheck = { ...result };
    if (!result.verified) {
      console.warn(`${TAG} Black borders: could not verify (only ${result.usedFrames} usable frames)`);
    } else if (result.ok) {
      info(`Black borders: none (checked ${result.usedFrames} frames, tolerance ${result.tolerancePx}px)`);
    } else {
      console.error(
        `${TAG} BLACK BORDERS FOUND in clean.mp4: top ${result.top}px, right ${result.right}px, `
        + `bottom ${result.bottom}px, left ${result.left}px`,
      );
    }
  } catch (error: any) {
    borderCheck = { error: String(error?.message ?? error) };
    console.error(`${TAG} Black border check failed: ${borderCheck.error}`);
  }

  // Субтитры: prepareReel при их сбое молча идёт дальше, поэтому итог берём из лога.
  let subtitleOutcome: { result: 'ready' | 'failed' | 'unknown' | 'off'; detail: string } = { result: 'off', detail: 'субтитры выключены' };
  if (subtitlesOn) {
    subtitleOutcome = await readSubtitleOutcome(logPath);
    if (subtitleOutcome.result === 'ready') {
      info('Subtitles: ready (burned into reel.mp4)');
      if (transcriptStats) {
        info(
          `Transcript (${transcription}${transcription === 'gemini' ? `, timing ${geminiTiming}` : ''}): `
          + `${transcriptStats.finalWords} words in the reel`
          + (transcriptStats.geminiWords !== null ? `, Gemini heard ${transcriptStats.geminiWords}` : '')
          + (transcriptStats.whisperWords !== null ? `, Whisper heard ${transcriptStats.whisperWords}` : '')
          + `, speakers ${transcriptStats.speakers}, languages ${JSON.stringify(transcriptStats.languages)}. `
          + 'Read it in subtitles/transcript.txt',
        );
      }
    } else {
      console.error(
        `${TAG} SUBTITLES WERE NOT ADDED (${subtitleOutcome.result}). reel.mp4 has no subtitles. `
        + 'The reason is in the lines marked [SUBTITLE ...] above and in run.log.',
      );
    }
  }

  // Качество источника: главная причина размытого ролика, когда YouTube отдаёт 360p вместо 4K.
  const source = await readSourceOutcome(logPath);
  if (source.found) {
    const description = `${source.width}x${source.height}, format ${source.format}, ${source.codec}, `
      + `${source.fps} fps, ${source.dynamicRange}, clients ${source.clients}, attempts ${source.attempts}`;
    const { resolutionTier } = await import('#server/global/engine/instagram/reel/utils/downloadTrailer');
    const tier = resolutionTier(Number(source.width), Number(source.height));
    const minTier = Number(process.env.REEL_SOURCE_MIN_HEIGHT?.trim() || 1080);
    if (tier < minTier) {
      console.error(
        `${TAG} SOURCE QUALITY LOW: ${description}. `
        + (source.hiddenFormats
          ? 'YouTube hid HD/4K for this session (SABR); the reel will be soft. Run it again later.'
          : 'YouTube did not hide formats, so this is the maximum of the video itself.'),
      );
    } else if (source.hiddenFormats && tier < 2160) {
      console.warn(`${TAG} Source quality: ${description}. YouTube hid part of the formats, 4K may exist.`);
    } else {
      info(`Source quality: ${description}`);
    }
  } else {
    console.warn(`${TAG} Source quality is unknown: ${source.detail}`);
  }

  // Кадры и контактный лист для просмотра глазами.
  const reelProbe = await ffprobeJson(reelPath);
  const cleanProbe = await ffprobeJson(cleanPath);
  const encoded = { clean: describeVideoStream(cleanProbe), reel: describeVideoStream(reelProbe) };
  info('Encoded video', encoded);
  const frameFiles: string[] = [];
  if (!args['no-frames']) {
    try {
      const duration = Number(reelProbe.format?.duration ?? 0);
      const frameTokens = (args.frames ?? '0.5,3,6,mid,end').split(',').map((value) => value.trim()).filter(Boolean);
      const frameTimes = frameTokens
        .map((token) => (token === 'mid' ? duration / 2 : token === 'end' ? duration - 1 : Number(token)))
        .filter((time) => Number.isFinite(time) && time >= 0 && (duration <= 0 || time < duration))
        .sort((left, right) => left - right);
      for (const time of frameTimes) {
        const file = `frame-${Number(time.toFixed(2))}s.png`;
        await runFfmpeg(['-ss', String(time), '-i', reelPath, '-frames:v', '1', path.join(runDir, file)]);
        frameFiles.push(file);
      }
      const sheetSeconds = 6;
      const sheetFile = `sheet-first-${sheetSeconds}s.png`;
      await runFfmpeg([
        '-t', String(sheetSeconds),
        '-i', reelPath,
        '-vf', 'fps=2,scale=400:-2,tile=4x3',
        '-frames:v', '1',
        path.join(runDir, sheetFile),
      ]);
      frameFiles.push(sheetFile);
    } catch (error: any) {
      console.error(`${TAG} Frames were not created: ${String(error?.message ?? error)}`);
    }
  }

  const summary = {
    args,
    trailerKey,
    hookGivenByUser: hook,
    hookFromGemini: generatedHook,
    caption: { file: 'caption.txt', length: caption.length, note: captionNote },
    subtitlesOn,
    subtitles: subtitleOutcome,
    transcription: subtitlesOn
      ? { provider: transcription, geminiTiming: transcription === 'gemini' ? geminiTiming : null, whisperFallback: process.env.REEL_SUBTITLE_TRANSCRIPTION_FALLBACK === 'whisper', stats: transcriptStats }
      : null,
    borderCheck,
    source,
    encoded,
    timingsMs: { prepareReelMs, publishMs, totalMs: Date.now() - startedAt },
    clean: cleanProbe,
    reel: reelProbe,
    checks,
    files: ['reel.mp4', 'clean.mp4', 'caption.txt', 'instagram-request.json', 'run.log', ...(transcriptStats ? ['subtitles/transcript.txt'] : []), ...frameFiles],
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  info('Done. Open this folder', runDir);
  info('Files', summary.files);
  return 0;
}

main()
  .then(async (code) => {
    // Явный выход: локальный BGUtil-сервер, запущенный yt-dlp, иначе держал бы терминал открытым.
    await new Promise((resolve) => setTimeout(resolve, 150));
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(`${TAG} Failed:`, error);
    if (/\[TRAILER QUALITY\]|LowSourceQualityError/.test(`${(error as any)?.name ?? ''} ${(error as any)?.message ?? error}`)) {
      console.error(
        `${TAG} YouTube returned only a low-resolution file in this session (SABR). The code and settings are fine: `
        + 'run the same command again in a few minutes, the mode is assigned per session. '
        + 'The [TRAILER SOURCE] lines above show what each client set returned.',
      );
    }
    if (failureSummaryPath) {
      await writeFile(
        failureSummaryPath,
        `${JSON.stringify({ failed: true, error: String((error as any)?.stack ?? error) }, null, 2)}\n`,
        'utf8',
      ).catch(() => undefined);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    process.exit(1);
  });

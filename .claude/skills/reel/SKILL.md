---
name: reel
description: Правила сборки Instagram Reel «Киноманов» и порядок работы с ними — кадр 1080×1080 с видео 5:4, слежение за лицом по X и Y с отзеркаленными краями, тайминги неоновых субтитров по образцу владельца, перевод иностранной речи, сухой прогон и самопроверка замерами (раскадровка, Whisper по словам), выкатка воркера Cloud Run. Использовать при любой правке монтажа, кадрирования, субтитров, перевода или оформления Reel, при жалобе на готовый ролик («субтитры раньше/позже», «чёрные полосы», «лицо не в центре», «без перевода») и при сравнении с образцом.
---

# Reel: правила и порядок работы

Код — `server/global/engine/instagram/reel/` (общий для Vercel и воркера), воркер — `workers/reel-worker`.
Отвечать по-русски. Решения владельца ниже — не менять без его слова; цифры — из замеров по его образцу (23.11).

## 1. Кадр

- Ролик 1080×1080: видео 5:4 (1080×864) по центру, поля по 108 px (`REEL_WIDTH/HEIGHT/FRAME_HEIGHT`,
  `utils/prepareInstagramVideo.ts`; поля — `decorateInstagramVideo.ts`). Субтитры и «Сохрани» — на видео,
  хук и полоска — на весь кадр.
- **Внутри окна 5:4 чёрного быть не должно.** Чёрные полосы исходника срезаются (`analyzeSelectedSegment`),
  нехватка кадра при слежении заполняется отражением.

## 2. Слежение за лицом (режим `follow`, `tracking/framing.ts`)

| Правило | Значение | Где |
|---|---|---|
| Анализ | 6 к/с, YuNet, лицо ≥ 0,75 и ≥ 10 % высоты, группа — если помещается | `analyzeSegment`, `groupBox` |
| План с лицом | лицо есть в ≥ 50 % кадров плана | `SHOT_FACE_SHARE` |
| Приближение | окно в 1,2 раза меньше наибольшего 5:4 | `REEL_TRACK_ZOOM` (1–1,6) |
| Центр | лицо по X в центре, по Y на 45 % высоты окна | `FOLLOW_FACE_TOP_SHARE` |
| Движение | медиана из 3 + среднее ±0,35 с (без запаздывания); разброс < 5 % — камера стоит | `FOLLOW_SMOOTH_SECONDS`, `FOLLOW_HOLD_SHARE` |
| Выход за картинку | до 20 % стороны окна — отражение | `FOLLOW_MIRROR_MAX_SHARE` |
| План без лица | окно шире (титры целиком), отражение сверху+снизу ≤ 30 % | `FIT_MAX_MIRROR_SHARE` |
| Склейка | прыжок ровно на склейке, шторка — переезд 0,5 с | `interpolate`, `writeFollowCommands` |
| Логотип канала «B» | окно правее него; без лица — прежнее окно (логотип не показывать) | `logoMinLeft` |
| Раскрытие плашки логотипа | прежнее слежение по X + zoompan | `planLogoZoom` |

Отражение — `mirrorExtendFilter`: `pad` + `fillborders=mirror`, поверх размытая (¼ размера, boxblur) и
чуть тёмная копия по маске-градиенту от края картинки (маска считается один раз). Окно — `sendcmd` →
`crop@track<N>` (только x, y): **размер crop на лету не менять** — ffmpeg 6.1 на смене w/h зависает
(сборка падает по таймауту 240 с с пустым stderr). У каждого размера окна своя ветка (`split` → crop →
масштаб), нужная выбирается `streamselect@pick` (команда `map`): `buildFollowCommands`, `followSelectFilter`.
`REEL_TRACK_FOLLOW=off` возвращает прежнее слежение только по X.

## 3. Субтитры: тайминги (по образцу)

| Что | Правило | Где |
|---|---|---|
| Появление слова | со звуком, опережение 50 мс (не больше 60) | `entryLeadStartMs/EndMs` |
| Следующая фраза через ≤ 1 с | держится до неё, уходит за 0,1 с до её появления | `holdUntilNextMaxGapMs`, `exitTriggerLeadMs` |
| Пауза > 1 с | уходит через 0,1 с после речи | `exitNoNextDelayMs` |
| Склейка после речи | уходит вместе с планом (склейки — ffmpeg scdet) | `planPhraseExits`, `utils/shot-cuts.ts` |
| Растянутое слово (музыка) | считается не длиннее 1,2 с | `maxWordHoldMs` |
| Уход | волна слева направо ~0,3 с | `exitWaveStepMs 10`, фазы по 110 мс |
| Новая фраза | пауза > 1 с, конец предложения, смена говорящего | `splitOnPauseSeconds`, `sameSpeakerContinueSeconds` |

Настройки — `subtitle/config.ts`, расписание — `render/phrase-flow.ts`, ASS — `render/generate-ass.ts`.

## 4. Расшифровка и перевод

Порядок в воркере (`REEL_SUBTITLE_TRANSCRIPTION_PROVIDER=gemini`): Gemini (`gemini-3.5-transcribe`, язык
сам) → время слов по Whisper (**на языке речи**: `whisperTimingLanguage`, иначе слова не совпадают и
время остаётся у Gemini, а оно уплывает) → дослушивание пропусков → проверка текста → **перевод** →
привязка к голосу → говорящие.

- Перевод обязателен, если иностранной речи много (`needsTranslation`). Модели по кругу:
  `gemini-3.8-flash`, затем `3.5-flash-lite`, `3.5-flash`, `3.7-flash`, `2.5-flash`; паузы между кругами
  5/15/30/60 с, у 429 — пауза из ответа. Проверка текста при нужном переводе — одна попытка.
- Перевод не получен — шаг падает: «Перевод не получен: Gemini 429/503». Ролик с английскими
  субтитрами не выходит. Что делать: подождать квоту и нажать «Пересобрать» / перезапустить задачу.
- Логи: `[SUBTITLE] Foreign speech`, `Translation request failed`, `Gemini words re-timed` (`matched`).
  Cloud Logging: `gcloud logging read 'resource.type="cloud_run_job" AND textPayload:"Foreign speech"' --freshness 2d`
  (в PowerShell — `gcloud` работает, в Git Bash нет Python).

## 5. Сухой прогон и самопроверка

```
YTDLP_PATH=<основной checkout>/tmp/tools/yt-dlp.exe \
WHISPER_MODEL_PATH=<основной checkout>/server/models/ggml-small.bin \
npx tsx --tsconfig tsconfig.reel-dryrun.json --env-file=<.env> \
  server/global/engine/instagram/reel/scripts/dryrun-publish.ts --key <youtube id> --title "…" --subtitles on --name <имя> --out-dir <scratchpad>
```
Запускать из checkout со своими `node_modules` (нужен `onnxruntime-node` — ESM не видит `NODE_PATH`) и с
запущенным локальным bgutil на порту 4416 (`node bgutil-ytdlp-pot-provider/server/build/main.js --port 4416`
из основного checkout), иначе YouTube не отдаёт трейлер. Ключ трейлера — `reel_processing_jobs.key_trailer` (чтение базы). Результат: `reel.mp4`, `clean.mp4`,
`subtitles/` (words.json, blocks.json, subtitles.ass), `summary.json`, `run.log`.

Самопроверка (ffmpeg, без Python):
- **Раскадровка всего ролика** 2 к/с: `-vf "fps=2,scale=240:-1,drawtext=...:text='%{pts\:hms}',tile=8x10"` —
  лицо в центре, нет чёрного внутри окна, титры целиком, нет видимого шва отражения.
- **Полоса субтитров** 10 к/с с метками времени (crop полосы, `tile=4x15`) против слов Whisper:
  `ffmpeg -i x.mp4 -vn -af "whisper=model=ggml-small.bin:language=<язык>:queue=20s:max_len=1:destination=w.json:format=json" -f null NUL`
  (системный ffmpeg с фильтром whisper, не ffmpeg-static; запускать из папки модели в PowerShell — Git Bash
  ломает пути фильтра). Слово ≤ 60 мс до звука, конец фразы ≤ 0,25 с после речи или до следующей фразы.
  Whisper по готовому ролику с музыкой грубый (время слов внутри сегмента растянуто) — спорные места
  сверять с громкостью речи: `highpass=250,lowpass=3500,asetnsamples=…,astats` по 0,1 с, подъём = начало слова.
- Сравнение с образцом — те же два листа по образцу и по своему ролику.
- Готовый ролик — только администратору в Telegram (скилл `telegram-test`), не в канал и не в Instagram.

## 6. Тесты и выкатка

- Тесты: `server/global/publishers/tests/reelSubtitles.test.ts`, `reelFraming.test.ts`, `reelLookMusic.test.ts`
  (общая команда — в `CLAUDE.md`).
- Воркер собирается из master: памятка «выкатка» в `TASKS.md` (`gcloud builds submit …`, `gcloud run jobs update …`,
  тег +1). **Пуш и выкатка — только после «да» владельца.**

## Частые сбои

| Симптом | Причина | Где смотреть |
|---|---|---|
| Субтитры на английском | перевод не получен (429/503) | лог `Translation request failed`; теперь — ошибка шага |
| Слова раньше/позже звука | время Gemini (Whisper не совпал) | `Gemini words re-timed … matched` |
| Первое слово фразы на секунды раньше звука | привязка к голосу перенесла его в хвост прошлого предложения | `alignWordsToVoiceSegments` (через «.!?…» не переносит), лог `Word timings snapped` (`relocated`) |
| Сборка clean висит / таймаут без stderr | crop меняет размер на лету | только x/y в `crop@track<N>`, ветки + `streamselect` |
| Слово висит на нескольких планах | растянутое время слова / пауза не разбила фразу | `maxWordHoldMs`, `sameSpeakerContinueSeconds` |
| Чёрное внутри окна | полосы исходника не срезаны | `[REEL BORDER CHECK]`, `[REEL CROPDETECT]` |
| Лицо не в центре | лица нет в половине кадров плана / логотип | `[REEL FRAMING] Following faces` (trackedShots) |

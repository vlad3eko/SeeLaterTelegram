# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

«Киноманов»: Telegram-бот и сайт про фильмы и сериалы (Nuxt 4 / Nitro на Vercel, Telegraf 4, Supabase, TMDB), канал @kinomanovnet, публикация Reels в Instagram. Код, комментарии и коммиты — на русском.

`TASKS.md` — живой журнал проекта: что сделано, что в работе, решения владельца, памятка по выкатке воркера и все переменные Cloud Run. Читать в начале работы, обновлять после заметной правки. Если он расходится с кодом — верить коду, файл исправить. `README.md` — шаблон Nuxt, пользы нет.

## Команды

```
npm run dev                 # nuxt dev на 127.0.0.1:3000; бот в dev — polling тестовым ботом (TELEGRAM_DEV_TOKEN)
npm run build               # nuxt build + scripts/prepareMediaTools.mjs (yt-dlp для Vercel)
npm run test:collections    # тесты подборок /g
```

Тестов-раннера нет: тесты — `node:test`, запускаются через `tsx` с `tsconfig.reel-dryrun.json` (он задаёт алиасы `#server/*` и `~/*`). Весь набор:

```
npx tsx --tsconfig tsconfig.reel-dryrun.json --test server/global/engine/notifications/tests/*.test.ts server/global/engine/collections/tests/*.test.ts server/global/publishers/tests/*.test.ts server/global/engine/instagram/comments/tests/*.test.ts
```

Один файл — тот же вызов с одним путём; один тест — добавить `--test-name-pattern "<часть названия>"`. Линтера нет. Типы отдельных файлов проверяются `node_modules/.bin/tsc -p <tsconfig, расширяющий tsconfig.reel-dryrun.json, с include нужных файлов>` (Nitro-авто-импорты вроде `defineEventHandler` так не видны).

Разовые скрипты с доступом к базе и Telegram — `npx tsx --env-file=.env --tsconfig tsconfig.reel-dryrun.json <файл>.ts`. Модули, которые ходят через `$fetch` (карточки, TMDB через свои роуты `/api/tmdb/*`), вне Nitro требуют подставить `globalThis.$fetch = ofetch.create({baseURL: 'https://kinomanov.net'})` до импорта.

Другие скрипты: `npm run bundles:run` / `bundles:audit` (связки подборок с судьёй Gemini), `npm run reel:dryrun -- --key <youtube id> ...` (сухой прогон Reel, описание — в `TASKS.md` и в шапке `server/global/engine/instagram/reel/scripts/dryrun-publish.ts`), `node --env-file=.env scripts/covers/buildCovers.mjs --screens <экраны> [--publish]` (обложки экранов /g, нужны Chrome и ffmpeg).

## Архитектура

**Бот.** `server/bot/bot.ts` создаёт Telegraf и регистрирует команды, кнопки и обработчики (`server/bot/services/registerFunctions/*`). В production апдейты приходят на `server/api/bot/webhook.post.ts` (секрет `x-telegram-bot-api-secret-token` выводится HMAC из токена; регистрация — `scripts/setTelegramWebhook.mjs`), в dev — polling. Выбор бота везде одним правилом: `NODE_ENV === 'development'` → тестовый бот, иначе боевой. file_id принадлежит загрузившему боту, поэтому кэши file_id (`telegram_media_cache`, `collection_covers.bot`) разделены по этому же правилу.

**Кнопки.** Каждая callback-кнопка — маршрут `defineCallback` в `server/bot/callbacks/routes.ts`: якорный regexp, `encode`/`decode`, лимит Telegram 64 байта. Обработчик регистрируется `bot.action(ROUTE.pattern, …)` и читает параметры `ROUTE.parse(ctx)`. Кнопки поста в канале — не callback, а ссылки `t.me/<бот>?start=<payload>`, разбираются в `bot.start` (`registerCommands.ts`) с проверкой подписки на канал (`isSubscriber`).

**Rich Messages.** Карточки, списки, подборки, сводка уведомлений и `/status` — Bot API Rich Message (`sendRichMessage` / `editMessageText` с `rich_message: {blocks}`), вызываются через `ctx.telegram.callApi`, типов в Telegraf нет. Блоки: heading, paragraph, list, table, details (сворачиваемый), blockquote, pullquote, collage, photo, animation, footer, divider; RichText — строки и `{type: 'bold'|'italic'|'code'|'url', …}`. Перерисовка на месте — `tryGenerateCard(normalizeRichContext(ctx), rich, keyboard)`.

**Карточки.** `server/global/engine/card/`: `engineRichCard` → `constructRichCard` → `resolveRichItem` + стратегии `strategy/resolveCardStrategies.ts` → подпись `variant/createMediaCaption.ts` (фильм и сериал — одна функция) и клавиатура `server/bot/consts/buttons/*` (контекст кнопок `inline` / `channel`). Фото актёров и обложки загружаются в служебный канал `TELEGRAM_MEDIA_STORAGE_CHAT_ID` один раз, дальше — file_id из `telegram_media_cache`.

**Внутренние роуты.** `server/middleware/internal-only.ts` закрывает `/api/bot/*` и ряд `/api/auth/*`: бот вызывает их через `internalFetch` с заголовком внутреннего секрета, снаружи — 403. Роут, который должен вызываться снаружи (таймеры Cloud Scheduler с `Authorization: Bearer CRON_SECRET`), добавляется в `PUBLIC_BOT_PATHS` в `server/utils/api/internalPaths.ts`, иначе Scheduler получит 403.

**Подсистемы:**
- **Подборки `/g`** — `server/global/engine/collections/` (TMDB с кэшем, связки, люди, именинники) и экраны мастера `server/bot/actions/collections/`. Связки считает GitHub Actions `collection-bundles.yml` (пн и чт 05:00 UTC), обложки экранов — `collection-covers.yml` (`scripts/covers/`, шаблон `template.html`, MP4 → `collection_covers`).
- **Уведомления по сохранённым** — `server/global/engine/notifications/`. `detect.ts`: каждый тайтл из `favorites` проверяется один раз на всех (`media_watch`), события в `media_events` с уникальным `event_key`; первая проверка — снимок без событий, переносы и постеры подтверждаются второй проверкой. `snapshot.ts` — чистые функции сравнения и частоты проверок. `digest.ts` — чистая сборка сводки. `digestJob.ts` — очередь `digest_deliveries`: подготовка с 09:00 МСК частями, рассылка с 10:00, статус `sending` до отправки (без дублей). Таймер — `server/api/bot/notifications/tick.ts` (Cloud Scheduler каждые 30 мин, общий лимит запуска, при нехватке времени сам перезапускается). `NOTIFICATIONS_DIGEST=all|admin|off`.
- **Reels** — Vercel ставит задачу в `reel_processing_jobs` (одна запись на фильм) и запускает Cloud Run Job `kinomanov-reel-worker` (`workers/reel-worker`, импортирует код из `server/` через алиас `#server`); воркер собирает ролик и отчитывается на `/api/bot/reelJobs/*`, финализатор на Vercel публикует в канал и Instagram. Подробности и выкатка образа — `TASKS.md`.
- **Instagram «СОХРАНИТЬ»** — `server/global/engine/instagram/comments/`: таймер `/api/bot/instagram/tick` (Scheduler, 5 мин) опрашивает комментарии Reels (webhook на Reels Meta не шлёт), отвечает в Direct ссылкой `?start=ig_<токен>`; ветка `ig_` в `bot.start` привязывает `users.instagram_id` и сохраняет фильм через `createFavorite`. Режим — `INSTAGRAM_COMMENTS=off|log|send`, подробности в `TASKS.md`.
- **Очередь YouTube** — `server/global/engine/youtube/` (`youtube_publish_queue`, слоты публикации), запускается своим таймером Scheduler.
- **`/status`** — панель администратора `server/bot/actions/admin/status/adminStatus.ts`.

**База.** Supabase; миграции — `database/migrations/*.sql`, применяются вручную в SQL Editor (их запускает владелец). Код должен переживать отсутствие новой таблицы (см. `isMissingTable` в `detect.ts`).

**Ограничения среды.** Функции Vercel — до 300 с (`vercel.json`); долгие задачи — через очереди в базе и таймеры, тяжёлое (yt-dlp, ffmpeg, Whisper) — в воркере Cloud Run. Время продукта — Москва (`moscowDate`, `moscowMinutes` в `notifications/snapshot.ts`).

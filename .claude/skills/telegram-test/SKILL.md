---
name: telegram-test
description: Проверка «Киноманов» перед выкаткой — тесты node:test, проверка типов изменённых файлов и тестовое Rich-сообщение администратору в Telegram (карточка фильма/сериала, сводка уведомлений, /status, любой Rich JSON). Использовать после правки бота, карточек, уведомлений, /status или подборок, когда нужно «дать тест» или убедиться, что сообщение собирается и Telegram его принимает.
---

# Проверка изменений и тест в Telegram

Порядок: тесты → типы → тестовое сообщение администратору → отчёт. Всё запускается из корня checkout
(в worktree — из папки worktree). `.env` лежит в корне основного checkout:
`D:/JS/Apps/Practice/SeeLaterTelegram/.env` (из worktree `.claude/worktrees/<имя>` это `../../../.env`).

## 1. Тесты

```
npx tsx --tsconfig tsconfig.reel-dryrun.json --test server/global/engine/notifications/tests/*.test.ts server/global/engine/collections/tests/*.test.ts server/global/publishers/tests/*.test.ts
```

Один тест — добавить `--test-name-pattern "<часть названия>"`. В отчёт — число пройденных и упавших;
по упавшему — имя теста и первая строка ошибки.

## 2. Типы изменённых файлов

Линтера нет. Временный tsconfig в scratchpad (не в репозитории), расширяющий `tsconfig.reel-dryrun.json`:

```json
{"extends": "<абсолютный путь>/tsconfig.reel-dryrun.json", "compilerOptions": {"noEmit": true}, "include": ["<абсолютные пути изменённых .ts>"]}
```

`node_modules/.bin/tsc -p <этот файл>`. Ошибки про Nitro-авто-импорты (`defineEventHandler`, `getQuery`,
`readBody`, `createError`, `useRuntimeConfig`) и про `.vue` — шум, их не считать. Ошибки в файлах, которых
правка не касалась, упомянуть отдельно как старые.

## 3. Тестовое сообщение администратору

```
npx tsx --env-file=<.env> --tsconfig tsconfig.reel-dryrun.json .claude/skills/telegram-test/send.ts <режим>
```

| Режим | Что приходит |
|---|---|
| `card movie <tmdbId>` / `card tv <tmdbId> [contentType]` | карточка, как в боте (`constructRichCard`) |
| `digest` | сводка уведомлений на демо-событиях по сохранённым администратора, с обложкой и кнопками |
| `status` | панель `/status` |
| `rich <файл.json>` | любой `{"blocks": [...]}` или `{"rich": {...}, "keyboard": {...}}` — для новых блоков |

Скрипт шлёт **только** `ADMIN_TELEGRAM_ID` (`server/global/oneLinkApp.ts`) от боевого бота и печатает
`[TEST] <что>: telegram true` или `telegram false — <описание Telegram>`. Проверенные id: фильм 27205
(«Начало»), сериал 1399 («Игра престолов»).

Частые ответы Telegram:
- `RICH_MESSAGE_PHOTO_INVALID` — file_id другого бота: кэш `telegram_media_cache` выбирается по `NODE_ENV`
  (`dev_`/`prod_`), не запускать с `NODE_ENV=development`.
- `can't parse rich message` / `BLOCK_INVALID` — неверный блок: смотреть типы блоков в `CLAUDE.md`
  (раздел Rich Messages), у `details` — `summary` + `blocks`, у таблицы — `cells`.
- `$fetch is not defined` — модуль импортирован до подстановки `$fetch`; импортировать динамически после неё,
  как в `send.ts`.

Новый вид сообщения, которого нет в режимах: собрать его во временном `.ts` в scratchpad по образцу
`send.ts` (те же `--env-file` и `--tsconfig`, `$fetch` до динамических импортов), отправить и удалить файл.

## Правила

- Никому, кроме администратора: ни пользователям, ни в канал, ни в Instagram. Финализаторы Reels,
  `sendDigests`, `prepareDigests` и таймеры не вызывать — они шлют реальным людям.
- Секреты не выводить: не печатать `process.env`, `.env`, токены, ключи, URL с токеном. В отчёт — только итог.
- База: читать можно; писать — только тестовую строку `digest_deliveries` за `2000-01-01` (делает `send.ts`).
  Миграции не применять — это делает владелец.
- Временные файлы — в scratchpad, после проверки удалить. Не коммитить и не пушить.

## Отчёт

По-русски, коротко: тесты (N из M), типы (чисто / ошибки по файлам), что отправлено и ответ Telegram,
что не удалось проверить и почему. Без пересказа кода.

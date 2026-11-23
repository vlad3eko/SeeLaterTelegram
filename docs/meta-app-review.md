# Заявка на проверку приложения Meta (kino7run, ID 1493923959296533)

Зачем: чтобы вебхук `comments` приходил по комментариям **любых** людей (сейчас — только по аккаунтам с ролью
в приложении), и ответ на «СОХРАНИТЬ» уходил за секунды. Пока проверки нет — отвечает таймер (до 5 минут).
Код менять после одобрения не нужно: роут `/api/instagram/webhook` уже работает.

## 0. До подачи

1. **Подтверждение компании** (Настройки приложения → Основное → Business portfolio → «Начать подтверждение»).
   Для расширенного доступа Meta обычно требует подтверждённый бизнес. Нужны документы о компании/ИП;
   если их нет — сначала спросить поддержку Meta, можно ли пройти проверку без этого.
2. Заполнено в «Основное»: политика `https://kinomanov.net/privacy`, удаление данных
   `https://kinomanov.net/privacy#delete`, значок, категория «Развлечения», контактный e-mail.
3. Приложение в рабочем режиме (уже).

## 1. Какие разрешения запросить (Проверка приложения → Разрешения и функции → «Запросить расширенный доступ»)

| Разрешение | Зачем нам |
|---|---|
| `instagram_manage_comments` | читать комментарии под своими Reels, вебхук `comments`, ответ под комментарием |
| `instagram_manage_messages` | Private Reply — одно сообщение в Direct автору комментария |
| `instagram_basic` | список своих Reels (id, подпись, ссылка) |
| `pages_read_engagement` | обязательное сопровождение для Instagram API через вход Facebook |
| `pages_show_list` | то же (если форма попросит) |

## 2. Тексты для формы (вставлять как есть)

**App description / How will your app use this permission — общий абзац:**

> Kinomanov is a movie & TV recommendation service (website kinomanov.net and Telegram bot @kinomanovNet_bot)
> that runs its own Instagram account @kinomanovnet. We publish Reels about upcoming movies. When a person
> comments the keyword "СОХРАНИТЬ" ("SAVE") under one of our Reels, our server replies once with a Private
> Reply in Instagram Direct containing a link to our Telegram bot, where the movie is added to the person's
> watchlist and they get a reminder when it is released. The app works only with our own Instagram
> Business account; we do not offer it to other businesses.

**instagram_manage_comments:**

> We read new comments on our own Reels (GET /{ig-media-id}/comments and the "comments" webhook) to find
> comments containing the keyword "СОХРАНИТЬ". For each such comment we reply once publicly under it
> (POST /{ig-comment-id}/replies) with a short confirmation, e.g. "Done! The link is in your Direct".
> We store only the comment id and the Instagram-scoped user id (deleted after 30 days); we do not store
> comment text or usernames. Without this permission we cannot detect the keyword in real time.

**instagram_manage_messages:**

> When a person comments "СОХРАНИТЬ" under our Reel, we send exactly one Private Reply
> (POST /{ig-user-id}/messages with recipient.comment_id) within 7 days of the comment, containing the
> link to our Telegram bot that saves the movie to their watchlist. People who already linked their
> Instagram to our bot instead receive a confirmation that the movie was saved. We never send
> unsolicited or promotional messages and never message people who did not comment the keyword.

**instagram_basic:**

> We list the media of our own Instagram account (GET /{ig-user-id}/media) to detect newly published Reels
> and ask our administrator (in Telegram) which movie the Reel is about, so replies contain the right title.

**pages_read_engagement / pages_show_list:**

> Required to access our Instagram Business account connected to our Facebook Page via Facebook Login
> for Business. We only access our own Page and its connected Instagram account.

## 3. Видеозапись экрана (screencast) — одна на все разрешения, 1–3 минуты

Записать с телефона или эмулятора (Instagram) + экран ПК, без звука можно, с подписями по-английски:

1. Facebook Login (ссылка «URL страницы для входа» из Instagram API → шаг 1): вход и экран с разрешениями
   `instagram_manage_comments`, `instagram_manage_messages` — нажать «Разрешить». (Meta просит показать, как
   пользователь приложения выдаёт разрешения; это вы как владелец аккаунта.)
2. Наш Reel в Instagram → с **другого** аккаунта комментарий «Сохранить».
3. Через несколько секунд: ответ под комментарием от @kinomanovnet и сообщение в Direct (папка «Запросы»)
   со ссылкой на бота.
4. Нажать ссылку → Telegram → бот @kinomanovNet_bot → «Старт» → сообщение «добавлено в вашу коллекцию».
5. (Желательно) Повторный комментарий «Сохранить» под другим Reel тем же аккаунтом → Direct «сохранили в
   вашу коллекцию» со ссылкой на бота — без повторного «Старт».

Подписи на видео: "Step 1: Admin grants permissions", "Step 2: A user comments the keyword", "Step 3: Our app
replies under the comment and sends one Private Reply", "Step 4: The user opens our Telegram bot and the movie
is saved".

## 4. Инструкция для проверяющих (Testing instructions)

> 1. Open any recent Reel on https://www.instagram.com/kinomanovnet/ (Reels tab).
> 2. Comment "Сохранить" (Russian for "Save") from any Instagram account.
> 3. Within a few seconds you will receive a public reply under your comment and one Private Reply in
>    Instagram Direct (check Message Requests) with a link to our Telegram bot.
> 4. Optional: open the link in Telegram and press "Start" — the movie is added to your watchlist.
> No login to our app is required for reviewers; the feature works for any Instagram user.

Важно: к моменту проверки под включёнными Reels кампании должны быть активны (в боте нажата кнопка фильма),
иначе проверяющий не получит ответа. Свежий Reel — лучше: окно Private Reply 7 дней.

## 5. Как узнать ответ Meta

- **Письмо** на почту аккаунта разработчика Facebook (и контактный e-mail приложения) — «Your submission … has
  been approved / needs changes».
- **Колокольчик** на developers.facebook.com и раздел «Проверка приложения → Запросы»: статус «На проверке» →
  «Одобрено» / «Требуются изменения» (с комментарием проверяющего, что исправить).
- **По факту**: после одобрения в логе Vercel появятся события `[IG WEBHOOK]` с `"keyword":1` по комментариям
  обычных людей, а ответ будет приходить за секунды. Проверить: `npx vercel logs --since 1h --query "IG WEBHOOK"`.

Срок — обычно несколько рабочих дней, бывает дольше; при отказе причина указана в запросе, после исправления
заявка подаётся заново.

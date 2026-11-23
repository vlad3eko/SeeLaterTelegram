<template>
  <article class="max-w-3xl my-10 flex flex-col gap-6 leading-relaxed">
    <header class="flex flex-col gap-2">
      <h1 class="text-3xl font-bold">Политика конфиденциальности</h1>
      <p class="opacity-70">Киноманов — сайт kinomanov.net, Telegram-бот @kinomanovNet_bot и Instagram @kinomanovnet. Редакция от 23 ноября 2026 года.</p>
    </header>

    <section class="flex flex-col gap-2">
      <h2 class="text-xl font-semibold">Какие данные мы получаем</h2>
      <ul class="list-disc pl-6 flex flex-col gap-1">
        <li><b>Telegram</b>: числовой id, имя и username — когда вы запускаете бота или входите на сайт через Telegram; подписаны ли вы на наши каналы.</li>
        <li><b>Коллекция</b>: фильмы и сериалы, которые вы сохранили, и настройки уведомлений о них.</li>
        <li><b>Instagram</b>: если вы написали «СОХРАНИТЬ» под нашим Reel — id комментария и обезличенный id автора, который Instagram выдаёт нашему аккаунту. Текст комментария и username мы не храним. Если вы открыли ссылку из Direct и нажали «Старт» в боте, этот id привязывается к вашему Telegram, чтобы следующие фильмы сохранялись сразу.</li>
        <li><b>Сайт</b>: cookie сессии, чтобы вы оставались в аккаунте.</li>
      </ul>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class="text-xl font-semibold">Зачем</h2>
      <p>Только чтобы работали функции сервиса: сохранить фильм в коллекцию, ответить на комментарий ссылкой в Direct, прислать напоминание о выходе фильма или новых сериях. Мы не продаём данные, не передаём их рекламным сетям и не используем для рекламы.</p>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class="text-xl font-semibold">Где хранятся и кому передаются</h2>
      <p>Данные хранятся в базе Supabase, сайт работает на Vercel. Сообщения отправляются через Telegram Bot API и Instagram API (Meta), сведения о фильмах берутся из TMDB — им передаётся только то, без чего сообщение или запрос не выполнить.</p>
      <p>Обезличенный id автора комментария, к которому не привязан Telegram, удаляется через 30 дней.</p>
    </section>

    <section id="delete" class="flex flex-col gap-2">
      <h2 class="text-xl font-semibold">Как удалить данные</h2>
      <ul class="list-disc pl-6 flex flex-col gap-1">
        <li>Отвязать Instagram от Telegram — команда <code>/instagram_off</code> в боте.</li>
        <li>Убрать фильм из коллекции — кнопка «Удалить» в карточке фильма в боте или на сайте.</li>
        <li>Удалить все данные — напишите боту @kinomanovNet_bot или на <a class="text-primary hover:underline" href="mailto:kino7run@gmail.com">kino7run@gmail.com</a>: удалим аккаунт, коллекцию и привязку Instagram в течение 30 дней и ответим, когда готово.</li>
      </ul>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class="text-xl font-semibold">Контакты</h2>
      <p>Вопросы о данных — <a class="text-primary hover:underline" href="mailto:kino7run@gmail.com">kino7run@gmail.com</a>. Об изменениях политики сообщим на этой странице.</p>
    </section>

    <section class="flex flex-col gap-2 opacity-70 text-sm">
      <h2 class="font-semibold">Summary (English)</h2>
      <p>Kinomanov stores your Telegram id and name, the titles you save, and — if you comment “СОХРАНИТЬ” under our Instagram Reels — the comment id and your Instagram-scoped id, only to send you the link and save the title. We do not store comment text, sell data or use it for ads. To delete your data, use /instagram_off in the bot or email kino7run@gmail.com; we delete it within 30 days.</p>
    </section>
  </article>
</template>

<script lang="ts" setup>
useHead({title: 'Политика конфиденциальности — Киноманов'})
</script>

// Сценарий «Сохрани»: как сохранить фильм из Reels комментарием «СОХРАНИТЬ» (актуальное в профиле + Reel).
// Образец для новых сценариев — справка: .claude/skills/promo-stories/SKILL.md. Сборка:
//   node scripts/promo/buildPromo.mjs --scenario save
window.PROMO = {
  // Фильм для примера: явные title/poster/backdrop (пути TMDB). С {media, id} сборка подтянет их сама.
  films: {main: {title: 'Дюна: Часть третья', poster: 'zbMASwT2PKpudXBRc2LExAQHASw', backdrop: 'i5E9H7Ik0u61ylDDTbmUpTL3Yw'}},
  coverPosters: ['zbMASwT2PKpudXBRc2LExAQHASw', '7zNm2hn9mfrapLLDHxGUJtm06wu', 'gNBiOPEbEPGPTfTIyGDvNQ50m0V', 'n7NR7SH7CyiiF70yN96r3d1jWr0', 'tD4kBIthK1NFxesGT5Pj42fM5u5'],
  stories: ['cover', 'comment', 'direct', 'telegram'],
  reel: ['cover', 'comment', 'direct', 'telegram', 'end'],
  slides: () => ({
  cover: {dur: 6.5, html: `${bg(.5, .35, .38)}
    <div class="scene" data-posters="cover"></div>
    ${brand}
    <div class="pill" style="left:30px;top:160px" data-in=".1"><b>Reels</b> → Telegram</div>
    <div class="title" data-title="Сохрани|фильм" data-size="96" style="left:26px;top:206px" data-in=".25"></div>
    <div class="lead" style="left:32px;top:432px;width:300px" data-in=".55">Увидели фильм в нашем Reels?<br>Напишите <b class="grad">«СОХРАНИТЬ»</b><br>в комментариях — бот в Telegram<br>добавит его в коллекцию</div>
    <div class="steps" style="left:28px;top:556px">
      <div class="step ok" data-in="1.1"><i>✓</i><span>Фильм <b>не потеряется</b></span></div>
      <div class="step ok" data-in="1.45"><i>✓</i><span><b>Напомню</b>, когда выйдет</span></div>
      <div class="step ok" data-in="1.8"><i>✓</i><span>Новые <b>серии и трейлеры</b></span></div>
      <div class="step ok" data-in="2.15"><i>✓</i><span><b>Бесплатно</b>, за 10 секунд</span></div>
    </div>
    <div class="cta" style="left:28px;top:800px" data-in="2.7" data-pulse="1">Как это работает — 3 шага →</div>`},

  comment: {dur: 8.5, html: `${bg(.45, .32, .36)}
    ${stepHead(1, 3, 'Reels', 'Напишите|«СОХРАНИТЬ»')}
    <div class="phone"><div class="screen">
      <div class="ig-reel" style="background-image:url(${FILM.backdrop})"></div>
      ${status}
      <div class="ig-sheet"><div class="handle"></div><h4>Комментарии</h4>
        <div class="cmt">${fakeAv(30, 20)}<div class="body"><div class="who blur">kino_lover_92 <span>2 ч.</span></div><div class="txt blur">Жду не дождусь, трейлер огонь 🔥</div><div class="meta">Ответить</div></div>${heart}</div>
        <div class="cmt">${fakeAv(30, 200)}<div class="body"><div class="who blur">marina.films <span>1 ч.</span></div><div class="txt blur">А когда в кино?</div><div class="meta">Ответить</div></div>${heart}</div>
                <div class="cmt" id="myComment" data-in="2.05">${myAv(30)}<div class="body"><div class="who"><span class="blur" style="color:#f5f5f5;font-weight:600">your.name</span> <span>сейчас</span></div><div class="txt" style="font-weight:600;display:inline-block">СОХРАНИТЬ</div><div class="meta">Ответить</div></div>${heart}</div>
        <div class="cmt reply" id="ourReply" data-in="4.4">${logoAv(24)}<div class="body"><div class="who">kinomanovnet <span class="badge-author">· Автор</span></div><div class="txt">Готово! Ссылка на фильм уже у вас в Direct 🎬 Подпишитесь на нас — тогда сообщения будут приходить сразу во входящие.</div></div></div>
      </div>
      <div class="ig-input">${myAv(32)}<div class="field" id="cField"><span><span class="ph">Добавьте комментарий…</span><span class="typed" data-type="СОХРАНИТЬ" data-from=".5" data-to="1.5" data-clear="2" data-post="#cPost"></span><span class="caret" data-blink="0.3-2"></span></span><span class="post" id="cPost">Опубл.</span></div></div>
      <div class="tap" data-tap="1.8" data-at="#cPost"></div>
    </div></div>`,
    marks: [
      {target: '#myComment .txt', at: 2.4, out: 4.3, pad: [16, 9], note: '<i>Шаг 1</i>Напишите «СОХРАНИТЬ» под нашим Reels', nx: 22, ny: 862, side: 'up'},
      {target: '#ourReply .txt', at: 4.8, pad: [14, 12], note: '<i>✓</i>Ответим — ссылка уже в Direct', nx: 150, ny: 862, side: 'up', ok: true}
    ]},

  direct: {dur: 9.5, html: `${bg(.45, .32, .36)}
    ${stepHead(2, 3, 'Direct', 'Откройте|Direct')}
    <div class="phone"><div class="screen">${status}
      <div class="layerScreen" id="inbox" data-out="3.05">
        <div class="ig-head"><span class="name blur">your.name</span><span style="margin-left:auto;font-size:18px">✎</span></div>
        <div class="ig-tabs"><div class="on" data-out="2.3">Основное</div><div>Общее</div><div id="reqTab">Запросы<span class="cnt">1</span></div></div>
        <div class="dm-list" data-out="2.3">
          ${[30, 260, 160, 90, 330].map((h, i) => `<div class="chat-row">${fakeAv(48, h)}<div><div class="n blur">${['dasha_k', 'film.club', 'max_ivanov', 'anna.p', 'serg_m'][i]}</div><div class="p blur">${['Ок, до завтра', 'Новое видео', 'Ты смотрел?', '❤️', 'Скинь ссылку'][i]} · ${i + 1} ч.</div></div></div>`).join('')}
        </div>
        <div class="dm-list" data-in="2.35">
          <div class="chat-row" id="reqRow">${logoAv(48)}<div><div class="n">kinomanovnet</div><div class="p"><b>🎬 Киноманов: ссылка на «${FILM.title}»</b></div></div></div>
        </div>
        <div class="tap" data-tap="2.1" data-at="#reqTab"></div>
        <div class="tap" data-tap="2.8" data-at="#reqRow"></div>
      </div>
      <div class="layerScreen" id="dmChat" data-in="3.05" data-anim="slide">
        <div class="ig-head"><span class="back">‹</span>${logoAv(28)}<div><div class="name" style="font-size:13.5px">kinomanovnet</div><div style="font-size:10.5px;color:#a8a8a8">Киноманов</div></div></div>
        <div class="flow" style="top:104px"><div class="dm-msg" id="dmText" data-in="3.35">🎬 Киноманов: ссылка на «${FILM.title}»

Вы написали «СОХРАНИТЬ» под нашим роликом. Вот бот, который сохранит этот фильм и напомнит, когда он выйдет:
<a id="dmLink" data-live="5.1" style="white-space:nowrap">t.me/kinomanovNet_bot?start=ig_…</a>

Как сохранить:
1. Нажмите на ссылку — откроется Telegram-бот Киноманов.
2. В чате с ботом нажмите кнопку «Старт» внизу.
Готово: фильм в вашей коллекции.</div>
        <div class="dm-out" data-in="4.7" data-anim="pop">+</div></div>
        <div class="dm-input"><div class="cam">◉</div><span>Сообщение…</span></div>
        <div class="tap" data-tap="7.2" data-at="#dmLink"></div>
      </div>
    </div></div>`,
    marks: [
      {target: '#reqTab', at: .7, out: 2.9, pad: [10, 8], note: '<i>?</i>Нет сообщения? Загляните в «Запросы»', nx: 120, ny: 430, side: 'up'},
      {target: '#dmLink', at: 5.4, pad: [10, 6], note: '<i>Шаг 2</i>Нажмите на ссылку', nx: 30, ny: 690, side: 'up'},
      {target: '.dm-out', at: 5.9, pad: [12, 10], note: '<i>+</i>Ссылка серая? Ответьте «+»', nx: 220, ny: 770, side: 'up', small: true}
    ]},

  telegram: {dur: 12, html: `${bg(.45, .32, .36)}
    ${stepHead(3, 3, 'Telegram', 'Нажмите|«Запустить»')}
    <div class="phone"><div class="screen"><div class="tg"><div class="tg-pattern"></div>${status}
      <div class="tg-head"><span class="back">‹</span>${logoAv(36)}<div><div class="n">Киноманов</div><div class="s">бот</div></div></div>
      <div class="tg-intro" data-out="2.55"><h5>Что умеет этот бот?</h5><p>Фильмы и сериалы с трейлерами, подборки и коллекция — бот напомнит о премьерах и новых сериях.</p></div>
      <div class="tg-start" id="startBtn" data-out="2.55"><div>ЗАПУСТИТЬ</div></div>
      <div class="tg-inputbar" data-in="2.55"><span>☺</span><span>Сообщение</span></div>
      <div class="flow" style="top:102px"><div class="tg-out" data-in="2.7">/start <small>9:42 ✓✓</small></div>
      <div class="tg-in" id="subMsg" data-in="3.0">Почти готово! Чтобы сохранить «${FILM.title}», подпишитесь на наши каналы:<br><br>• 🎬 Киноманов — новинки и уведомления<br>• 👨‍💻 Канал разработчика<br><br>Как только подпишетесь, фильм сохранится сам. <small>9:42</small></div>
      <div class="tg-btns" id="subBtns" data-in="3.15"><div>Подписаться: 🎬 Киноманов</div><div>Подписаться: 👨‍💻 Канал разработчика</div></div>
      <div class="tg-in" id="savedMsg" style="margin-top:4px" data-in="5.6" data-anim="pop">✅ «${FILM.title}» успешно сохранили, я напомню, когда он выйдет <small>9:43</small></div>
      <div class="tg-btns" data-in="5.75"><div>📦 Коллекция</div></div></div>
      <div class="tap" data-tap="2.2" data-at="#startBtn div"></div>
      <div class="tap" data-tap="4.6" data-at="#subBtns div"></div>
      <div class="tap" data-tap="5.05" data-at="#subBtns div:last-child"></div>
      <div class="skip" data-in="8.0"><div>15 декабря<span>в день премьеры</span></div></div>
      <div class="push" id="push" data-in="8.6" data-anim="drop">${tgIcon}
        <div style="flex:1"><div class="t">Киноманов <span>сейчас</span></div><div class="m">🍿 «${FILM.title}» вышла! Уже можно смотреть — трейлер и где посмотреть внутри</div></div></div>
    </div></div></div>`,
    marks: [
      {target: '#startBtn div', at: .6, out: 2.4, pad: [14, 10], note: '<i>Шаг 3</i>Нажмите «Запустить»', nx: 26, ny: 862, side: 'up'},
      {target: '#subBtns', at: 3.5, out: 5.4, pad: [8, 8], note: '<i>+</i>Подпишитесь — бот продолжит сам', nx: 240, ny: 712, side: 'up'},
      {target: '#savedMsg', at: 5.95, out: 7.9, pad: [8, 8], note: '<i>✓</i>Фильм в коллекции', nx: 300, ny: 790, side: 'up', ok: true},
      {target: '#push', at: 9.1, pad: [8, 8], note: '<i>🔔</i>Напомню, когда фильм выйдет', nx: 200, ny: 470, side: 'up', ok: true}
    ]},

  end: {dur: 4.5, html: `${bg(.5, .35, .38)}
    <div class="scene" data-posters="cover"></div>
    ${brand}
    <div class="pill" style="left:30px;top:160px" data-in=".1">под любым нашим <b>Reels</b></div>
    <div class="title" data-title="Напишите|СОХРАНИТЬ" data-size="70" style="left:26px;top:206px" data-in=".25"></div>
    <div class="lead" style="left:32px;top:420px;width:290px" data-in=".55">Остальное сделает бот:<br>сохранит фильм в коллекцию<br>и <b>напомнит о премьере</b></div>
    <div class="cta" style="left:28px;top:800px" data-in="1.1" data-pulse="1">Пишите «СОХРАНИТЬ» 🎬</div>`},

  icon: {dur: 1, icon: true, html: `${bg(.55, .4, .4)}
    <div style="position:absolute;inset:0;display:grid;place-items:center">
      <svg width="360" height="360" viewBox="0 0 100 100"><defs>
        <linearGradient id="ig" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="oklch(0.58 0.2 255)"/><stop offset=".55" stop-color="oklch(0.62 0.21 300)"/><stop offset="1" stop-color="oklch(0.72 0.2 350)"/></linearGradient>
        <filter id="sh"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#3a1f9a" flood-opacity=".4"/></filter></defs>
        <path filter="url(#sh)" d="M27 14h46a5 5 0 0 1 5 5v68l-28-16-28 16V19a5 5 0 0 1 5-5z" fill="url(#ig)"/>
        <path d="M27 14h46a5 5 0 0 1 5 5v10H22V19a5 5 0 0 1 5-5z" fill="#fff" opacity=".25"/>
        <path d="M38 42l9 9 17-18" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg></div>`}
  })
}

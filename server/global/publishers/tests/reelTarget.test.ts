import {test} from 'node:test'
import assert from 'node:assert/strict'
import {reelCaptionHtml, reelCaptionMessage, reelHeading, reelTarget} from '../reelTarget'
import {instagramGraphUrl} from '../instagram/instagramGraphUrl'

test('reelTarget: по умолчанию Reel приходит в бот для ручной загрузки, Instagram — только с REEL_TARGET=instagram', () => {
    assert.equal(reelTarget({NODE_ENV: 'development'} as NodeJS.ProcessEnv), 'telegram_preview')
    assert.equal(reelTarget({NODE_ENV: 'development', REEL_TARGET: 'instagram'} as NodeJS.ProcessEnv), 'telegram_preview')
    assert.equal(reelTarget({NODE_ENV: 'production'} as NodeJS.ProcessEnv), 'telegram_manual')
    assert.equal(reelTarget({} as NodeJS.ProcessEnv), 'telegram_manual')
    assert.equal(reelTarget({NODE_ENV: 'production', REEL_TARGET: 'instagram'} as NodeJS.ProcessEnv), 'instagram')
})

test('reelCaptionMessage: подпись блоком кода с экранированием, длинная обрезается под лимит Telegram', () => {
    assert.equal(reelCaptionMessage('Фильм <2026> & друзья'),
        '<b>Подпись для Instagram</b> (21 симв.) — нажмите «Копировать»:\n<pre>Фильм &lt;2026&gt; &amp; друзья</pre>')
    const long = reelCaptionMessage('&'.repeat(2200))
    assert.ok(long.length <= 4096 && long.endsWith('…</pre>'))
})

test('Reel в бот одним сообщением: заголовок и подпись под видео; длиннее лимита подписи к видео — отдельно', () => {
    const heading = reelHeading('Клифф Бут', false)
    assert.equal(heading, '📲 Reel «Клифф Бут» — загрузите в Instagram. Подпись — нажмите, чтобы скопировать:')
    assert.equal(reelCaptionHtml(heading, 'Ждёте? <3', 1024), `${heading}\n<pre>Ждёте? &lt;3</pre>`)
    // Самая длинная подпись из последних (469 символов) влезает с запасом.
    assert.ok(reelCaptionHtml(heading, 'я'.repeat(469), 1024))
    // Лимит считается по буквам без разметки: экранирование & → &amp; не мешает.
    assert.ok(reelCaptionHtml(heading, '&'.repeat(1024 - heading.length - 1), 1024))
    assert.equal(reelCaptionHtml(heading, 'я'.repeat(1024 - heading.length), 1024), undefined)
    assert.match(reelHeading(undefined, true), /^🧪 Dev: Reel — в Instagram не отправлен/)
})

test('instagramGraphUrl: адрес по виду ключа', () => {
    assert.equal(instagramGraphUrl('EAAabc'), 'https://graph.facebook.com/v26.0')
    assert.equal(instagramGraphUrl(' EAAabc '), 'https://graph.facebook.com/v26.0')
    assert.equal(instagramGraphUrl('IGAAabc'), 'https://graph.instagram.com/v26.0')
    assert.equal(instagramGraphUrl(''), 'https://graph.instagram.com/v26.0')
})

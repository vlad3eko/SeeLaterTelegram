import {test} from 'node:test'
import assert from 'node:assert/strict'
import {reelCaptionMessage, reelTarget} from '../reelTarget'
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

test('instagramGraphUrl: адрес по виду ключа', () => {
    assert.equal(instagramGraphUrl('EAAabc'), 'https://graph.facebook.com/v26.0')
    assert.equal(instagramGraphUrl(' EAAabc '), 'https://graph.facebook.com/v26.0')
    assert.equal(instagramGraphUrl('IGAAabc'), 'https://graph.instagram.com/v26.0')
    assert.equal(instagramGraphUrl(''), 'https://graph.instagram.com/v26.0')
})

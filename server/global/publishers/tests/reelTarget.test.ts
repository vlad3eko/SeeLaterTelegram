import {test} from 'node:test'
import assert from 'node:assert/strict'
import {reelTarget} from '../reelTarget'
import {instagramGraphUrl} from '../instagram/instagramGraphUrl'

test('reelTarget: dev-бот присылает Reel в чат, основной публикует в Instagram', () => {
    assert.equal(reelTarget({NODE_ENV: 'development'} as NodeJS.ProcessEnv), 'telegram_preview')
    assert.equal(reelTarget({NODE_ENV: 'production'} as NodeJS.ProcessEnv), 'instagram')
    assert.equal(reelTarget({} as NodeJS.ProcessEnv), 'instagram')
})

test('instagramGraphUrl: адрес по виду ключа', () => {
    assert.equal(instagramGraphUrl('EAAabc'), 'https://graph.facebook.com/v26.0')
    assert.equal(instagramGraphUrl(' EAAabc '), 'https://graph.facebook.com/v26.0')
    assert.equal(instagramGraphUrl('IGAAabc'), 'https://graph.instagram.com/v26.0')
    assert.equal(instagramGraphUrl(''), 'https://graph.instagram.com/v26.0')
})

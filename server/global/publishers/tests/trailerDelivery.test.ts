import assert from 'node:assert/strict'
import {test} from 'node:test'
import {trailerDeliveryToken, verifyTrailerDelivery} from '#server/global/engine/instagram/reel/jobs/trailerDelivery'

const request = {keyTrailer: 'xO92LnyDxQg', chatId: 788847654, expires: 2_000}

test('trailerDelivery: подпись проходит, подмена и просрочка — нет', () => {
    const token = trailerDeliveryToken(request, 'bot-token')
    assert.equal(verifyTrailerDelivery({...request, token}, 'bot-token', 1_000), true)
    assert.equal(verifyTrailerDelivery({...request, token}, 'other-token', 1_000), false)
    assert.equal(verifyTrailerDelivery({...request, chatId: 1, token}, 'bot-token', 1_000), false)
    assert.equal(verifyTrailerDelivery({...request, keyTrailer: 'aaaaaaaaaaa', token}, 'bot-token', 1_000), false)
    assert.equal(verifyTrailerDelivery({...request, token}, 'bot-token', 3_000), false)
    assert.equal(verifyTrailerDelivery({...request, token: undefined}, 'bot-token', 1_000), false)
})

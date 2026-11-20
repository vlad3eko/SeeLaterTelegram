import {test} from 'node:test'
import assert from 'node:assert/strict'
import {currentSlot, formatSlot, nextSlotAt, parseSlots} from '../../engine/youtube/schedule'
import {graphErrorText} from '../instagram/instagramGraphUrl'

// Москва — UTC+3 без перехода на летнее время.
const moscow = (time: string) => new Date(`2026-11-20T${time}+03:00`)
const slots = parseSlots(undefined)

test('расписание: по умолчанию 08:00, 12:00, 18:00, 22:00; неверное значение — по умолчанию', () => {
    assert.deepEqual(slots.map(formatSlot), ['08:00', '12:00', '18:00', '22:00'])
    assert.deepEqual(parseSlots('21:30, 9:05,мусор').map(formatSlot), ['09:05', '21:30'])
    assert.deepEqual(parseSlots('25:00').map(formatSlot), ['08:00', '12:00', '18:00', '22:00'])
})

test('расписание: публикация только в первый час слота, ночью — ничего', () => {
    assert.equal(currentSlot(moscow('07:59:00'), slots), undefined)
    assert.deepEqual(currentSlot(moscow('08:00:30'), slots), {slot: 8 * 60, start: moscow('08:00:00')})
    assert.deepEqual(currentSlot(moscow('08:59:59'), slots), {slot: 8 * 60, start: moscow('08:00:00')})
    assert.equal(currentSlot(moscow('09:00:00'), slots), undefined)
    assert.equal(currentSlot(moscow('11:50:00'), slots), undefined)
    assert.deepEqual(currentSlot(moscow('22:40:00'), slots)?.start, moscow('22:00:00'))
    for (const night of ['23:10:00', '00:19:00', '02:30:00', '06:00:00']) assert.equal(currentSlot(moscow(night), slots), undefined)
    // Слот перед полуночью: окно переходит на следующие сутки.
    assert.deepEqual(currentSlot(new Date('2026-11-21T00:10:00+03:00'), parseSlots('23:30'))?.start, moscow('23:30:00'))
})

test('расписание: следующий слот, после 22:00 — завтра в 08:00', () => {
    assert.deepEqual(nextSlotAt(moscow('09:15:42'), slots), moscow('12:00:00'))
    assert.deepEqual(nextSlotAt(moscow('12:00:10'), slots), moscow('18:00:00'))
    assert.deepEqual(nextSlotAt(moscow('23:05:00'), slots), new Date('2026-11-21T08:00:00+03:00'))
})

test('Instagram: причина ошибки из ответа Graph API', () => {
    const error = Object.assign(new Error('[POST] "https://graph.facebook.com/v26.0/1/media": 400 Bad Request'), {
        data: {error: {message: 'API access blocked.', code: 200, error_subcode: 5258005}}
    })
    assert.equal(graphErrorText(error), 'Instagram: API access blocked. (код 200/5258005)')
    assert.equal(graphErrorText(new Error('timeout')), undefined)
})

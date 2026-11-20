/**
 * Расписание автопубликации (решение владельца 20.11): ролики выходят в «живые» часы — по умолчанию
 * 08:00, 12:00, 18:00 и 22:00 по Москве, ночью ничего. Круглосуточная серия раз в 2 часа (четыре
 * Reels с полуночи до половины третьего) привела к проверке аккаунта в Meta.
 *
 * Слот действует SLOT_WINDOW_MINUTES: таймер срабатывает раз в 10–15 минут, и если за окно ролика
 * не нашлось, публикация ждёт следующего слота, а не выходит впритык к нему.
 */

export const DEFAULT_SLOTS = ['08:00', '12:00', '18:00', '22:00']
export const SLOT_WINDOW_MINUTES = 60
export const SCHEDULE_TIME_ZONE = 'Europe/Moscow'

const DAY_MINUTES = 24 * 60

/** «08:00,12:00» → минуты от полуночи по возрастанию; пусто или ошибка — DEFAULT_SLOTS. */
export const parseSlots = (raw: string | undefined): number[] => {
    const toMinutes = (value: string) => {
        const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
        return match ? Number(match[1]) * 60 + Number(match[2]) : undefined
    }
    const parsed = [...new Set((raw ?? '').split(',').map(toMinutes).filter((value): value is number => value !== undefined))]
    return (parsed.length ? parsed : DEFAULT_SLOTS.map(slot => toMinutes(slot)!)).sort((a, b) => a - b)
}

export const formatSlot = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** Минуты от местной полуночи (секунды отброшены). */
const localMinutes = (now: Date, timeZone: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(now)
    const part = (type: string) => Number(parts.find(item => item.type === type)?.value ?? 0)
    return part('hour') * 60 + part('minute')
}

/** Момент now минус целые минуты, с обнулёнными секундами. */
const minutesBefore = (now: Date, minutes: number) =>
    new Date(now.getTime() - minutes * 60_000 - (now.getTime() % 60_000))

/** Слот, окно которого идёт сейчас, или undefined (между слотами). */
export const currentSlot = (now: Date, slots: number[], timeZone = SCHEDULE_TIME_ZONE) => {
    const local = localMinutes(now, timeZone)
    const elapsed = Math.min(...slots.map(slot => (local - slot + DAY_MINUTES) % DAY_MINUTES))
    if (elapsed >= SLOT_WINDOW_MINUTES) return undefined
    const slot = slots.find(item => (local - item + DAY_MINUTES) % DAY_MINUTES === elapsed)!
    return {slot, start: minutesBefore(now, elapsed)}
}

/** Начало следующего слота (строго позже текущей минуты). */
export const nextSlotAt = (now: Date, slots: number[], timeZone = SCHEDULE_TIME_ZONE) => {
    const local = localMinutes(now, timeZone)
    const ahead = Math.min(...slots.map(slot => (slot - local + DAY_MINUTES) % DAY_MINUTES || DAY_MINUTES))
    return minutesBefore(now, -ahead)
}

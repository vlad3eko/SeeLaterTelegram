import {timingSafeEqual} from 'node:crypto'

/** Сверка токена задачи (input_payload.finalizerToken), который воркер присылает в колбэках. */
export const finalizerTokenEquals = (received: unknown, expected: unknown): boolean => {
    if (typeof received !== 'string' || typeof expected !== 'string') return false
    if (!received || !expected) return false

    const receivedBuffer = Buffer.from(received)
    const expectedBuffer = Buffer.from(expected)
    if (receivedBuffer.length !== expectedBuffer.length) return false

    return timingSafeEqual(receivedBuffer, expectedBuffer)
}

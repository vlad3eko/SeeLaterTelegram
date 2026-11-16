import {youtubeQueueConfig} from '#server/global/engine/youtube/config'

// npm run dev: тот же тик очереди YouTube, что в production вызывает Cloud Scheduler
// (/api/bot/youtubeQueue/tick), только по встроенному таймеру. В production плагин ничего
// не делает. Выключить в dev: YOUTUBE_QUEUE_DEV_TICK=off.
//
// Задача Reel ставится только с https-адресом финализатора, то есть при npm run dev:tunnel;
// в обычном npm run dev ролики ждут в очереди.
export default defineNitroPlugin(() => {
    if (process.env.NODE_ENV !== 'development') return

    const config = youtubeQueueConfig()
    if (!config.devTick || !config.enabled) {
        console.log('[YOUTUBE QUEUE DEV] Timer is off')
        return
    }

    let running = false

    const tick = async () => {
        if (running) return
        running = true
        try {
            const {processYoutubeQueue} = await import('#server/global/engine/youtube/youtubeQueue')
            const result = await processYoutubeQueue()
            console.log('[YOUTUBE QUEUE DEV] Tick', JSON.stringify(result))
        } catch (error) {
            console.error('[YOUTUBE QUEUE DEV] Tick failed', error instanceof Error ? error.message : error)
        } finally {
            running = false
        }
    }

    console.log(`[YOUTUBE QUEUE DEV] Timer every ${config.devTickMinutes} min`)
    const first = setTimeout(tick, 30_000)
    const timer = setInterval(tick, config.devTickMinutes * 60_000)
    first.unref?.()
    timer.unref?.()
})

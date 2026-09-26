import {publishInstagramReel} from "#server/global/publishers/instagram/publishInstagramReel"

export default defineEventHandler(async () => {

    const result =
        await publishInstagramReel({
            videoUrl:
                'https://kinomanov.net/instagram/copy-test.mp4',

            caption:
                'Тестовый Reel — reencode'
        })

    return {
        success: true,
        ...result
    }
})

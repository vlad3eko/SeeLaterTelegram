import {publishInstagramReel} from "#server/global/publishers/instagram/publishInstagramReel";

export default defineEventHandler(async () => {

    const result =
        await publishInstagramReel({
            videoUrl:
                'https://kinomanov.net/instagram/kinomanovnet-test-reel.mp4',

            caption:
                'Тестовый Reel KinomanovNet'
        })

    return {
        success: true,
        ...result
    }
})

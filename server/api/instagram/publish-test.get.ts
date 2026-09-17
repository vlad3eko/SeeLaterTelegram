import {publishInstagram} from "#server/global/publishers/instagram/publishInstagram";

export default defineEventHandler(async () => {

    const result =
        await publishInstagram({
            imageUrl:
                'https://image.tmdb.org/t/p/w600_and_h900_face/pK8CH9JxrgX2ZIq3WclTwnX0cCL.jpg',
            caption:
                'Тестовая публикация KinomanovNet'
        })

    return {
        success: true,
        ...result
    }
})

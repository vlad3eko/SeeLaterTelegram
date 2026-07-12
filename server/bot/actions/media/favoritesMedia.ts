export const favoritesMedia = (ctx:any, user: number) => {

    const userId = ctx.match[1]

    const data = await $fetch('/api/:media', {
            query: {
                userId
            }
        })

    console.log('data', data)
}

export const favoritesMedia = (ctx:any, user: number) => {

    console.log('ctx.from.id', ctx.from.id)
    console.log('user', ctx.match[1])
    console.log('callback', ctx.callback_query.from.id)
}

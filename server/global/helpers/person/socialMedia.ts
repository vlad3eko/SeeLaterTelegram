export const personSocials = (externalIds: any) => {

    if (!externalIds) return ''

    const links = [
        externalIds.instagram_id
            ? `<a href="https://www.instagram.com/${externalIds.instagram_id}">Instagram</a>`
            : '',

        externalIds.tiktok_id
            ? `<a href="https://www.tiktok.com/@${externalIds.tiktok_id}">TikTok</a>`
            : '',

        externalIds.twitter_id
            ? `<a href="https://x.com/${externalIds.twitter_id}">X</a>`
            : '',

        externalIds.facebook_id
            ? `<a href="https://www.facebook.com/${externalIds.facebook_id}">Facebook</a>`
            : '',

        externalIds.youtube_id
            ? `<a href="https://www.youtube.com/channel/${externalIds.youtube_id}">YouTube</a>`
            : '',

        externalIds.imdb_id
            ? `<a href="https://www.imdb.com/name/${externalIds.imdb_id}">IMDb</a>`
            : ''
    ]
        .filter(Boolean)

    if (!links.length) return ''

    return [
        '<b>🔗 СОЦ-СЕТИ</b>',
        links.join(' · ')
    ].join('\n')
}

export const linkOfMedia = (link: string, title?: string) => {
    const encodedTitle = encodeURIComponent(link)
    const altLink = title ? ` ${title}` : ''

    return `     • ` + `<i><a href="https://www.google.com/search?q=${encodedTitle + altLink}">«${link}»</a></i>`
}

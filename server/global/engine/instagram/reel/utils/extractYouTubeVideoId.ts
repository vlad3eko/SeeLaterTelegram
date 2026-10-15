export const extractYouTubeVideoId = (
    input: string
): string | undefined => {
    let value = input.trim()

    value = value.replace(
        /^keyTrailer\s*=\s*/i,
        ''
    ).trim()

    // Пользователь прислал непосредственно ID.
    if (/^[A-Za-z0-9_-]{11}$/.test(value)) {
        return value
    }

    // Извлекаем ссылку даже если вокруг неё есть текст.
    const linkMatch = value.match(
        /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/[^\s]+/i
    )

    if (!linkMatch) {
        return undefined
    }

    let link = linkMatch[0].replace(/[),.;]+$/g, '')

    if (!/^https?:\/\//i.test(link)) {
        link = `https://${link}`
    }

    try {
        const url = new URL(link)

        const hostname = url.hostname
            .toLowerCase()
            .replace(/^www\./, '')

        const allowedHosts = new Set([
            'youtube.com',
            'm.youtube.com',
            'music.youtube.com',
            'youtu.be',
            'youtube-nocookie.com'
        ])

        if (!allowedHosts.has(hostname)) {
            return undefined
        }

        let videoId: string | null | undefined

        if (hostname === 'youtu.be') {
            videoId = url.pathname
                .split('/')
                .filter(Boolean)[0]
        } else {
            videoId =
                url.searchParams.get('v') ??
                url.pathname.match(
                    /^\/(?:shorts|embed|live|v)\/([^/]+)/
                )?.[1]
        }

        return videoId &&
        /^[A-Za-z0-9_-]{11}$/.test(videoId)
            ? videoId
            : undefined

    } catch {
        return undefined
    }
}

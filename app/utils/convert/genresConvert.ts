import type {TmdbGenre} from "~/types/tmdb.types";

export const genresConvert = (
    genres: TmdbGenre[] = []
) => {

    if (!genres.length) {
        return ''
    }


    const formatGenre = (name: string) => {

        return name
            .split(' ')
            .filter(Boolean)
            .map((word, index) => {

                if (index === 0) {
                    return word
                }

                return (
                    word.charAt(0).toUpperCase() +
                    word.slice(1)
                )

            })
            .join('')
            .replace(
                /[^а-яА-Яa-zA-Z0-9]/g,
                ''
            )
    }


    return genres
        .map((genre) => {

            const words =
                genre.name.split(' ')


            // "НФ и Фэнтези" -> "#НФ #Фэнтези"
            if (words.includes('и')) {

                return words
                    .filter(word => word !== 'и')
                    .map(word => `#${formatGenre(word)}`)
                    .join(' ')
            }


            return `#${formatGenre(genre.name)}`

        })
        .filter(Boolean)
        .join(' • ')
}

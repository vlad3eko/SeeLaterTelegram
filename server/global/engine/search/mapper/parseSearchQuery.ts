import {ContentType} from "#server/global/engine/search/strategy/enums";
import type {SearchQuery} from "#server/global/engine/search/mapper/typesSearch";

export const parseSearchQuery = (
    query: string,
    userId: number
): SearchQuery => {

    let contentType: ContentType | undefined

    const words =
        query
            .trim()
            .split(/\s+/)
            .filter(Boolean)

    const id: number[] = []
    const personJob: string[] = []
    const genres: string[] = []
    const years: number[] = []
    const providers: string[] = []
    const countries: string[] = []
    const companies: string[] = []

    let bookmarksOfUserId:
        number | null = null

    const mediaTypes:
        ("movie" | "tv" | "person")[] = []

    let creditType:
        "cast" | "crew" | undefined

    let sort: string | undefined
    let vote: number | undefined

    const text: string[] = []

    for (const word of words) {

        const cleanWord =
            word.replace(
                /[()"«»'[\]<>]/g,
                ''
            )


        /*
         * =========================
         * TAG
         * =========================
         */

        if (cleanWord.startsWith("#")) {

            const tag =
                cleanWord
                    .slice(1)
                    .toLowerCase()

            if ([
                "фильм",
                "movie",
                "movies",
                "фильмы"
            ].includes(tag)) {

                mediaTypes.push("movie")
                contentType = ContentType.MOVIE

                continue
            }

            if ([
                "мультфильм",
                "cartoon",
                "мультфильмы"
            ].includes(tag)) {

                mediaTypes.push("movie")
                contentType = ContentType.CARTOON

                continue
            }

            if ([
                "сериал",
                "tv",
                "series",
                "serial",
                "сериалы"
            ].includes(tag)) {

                mediaTypes.push("tv")
                contentType = ContentType.SERIES

                continue
            }

            if ([
                "мультсериал",
                "мультсериалы"
            ].includes(tag)) {

                mediaTypes.push("tv")
                contentType = ContentType.CARTOON_SERIES

                continue
            }

            if ([
                "аниме",
                "anime"
            ].includes(tag)) {

                mediaTypes.push("tv")
                contentType = ContentType.ANIME

                continue
            }

            if ([
                "popular",
                "популярные"
            ].includes(tag)) {

                sort = "popularity.desc"

                continue
            }

            if ([
                "rating",
                "рейтинг"
            ].includes(tag)) {

                sort = "vote_average.desc"

                continue
            }

            if ([
                "new",
                "новые"
            ].includes(tag)) {

                sort = "primary_release_date.desc"

                continue
            }

            if ([
                "old",
                "старые"
            ].includes(tag)) {

                sort = "primary_release_date.asc"

                continue
            }

            if (tag === "collection") {

                bookmarksOfUserId = userId

                continue
            }

            if ([
                "person",
                "persona",
                "человек",
                "актёр",
                "actor"
            ].includes(tag)) {

                mediaTypes.push("person")
                contentType = ContentType.PERSON

                continue
            }


            /*
             * =========================
             * PERSON JOB
             * =========================
             */

            if ([
                "cast",
                "актер",
                "актёр",
                "роли"
            ].includes(tag)) {

                personJob.push("cast")
                creditType = "cast"

                continue
            }

            if (tag === "crew") {

                personJob.push("crew")
                creditType = "crew"

                continue
            }


            /*
             * =========================
             * GENRE
             * =========================
             */

            genres.push(tag)

            continue
        }


        /*
         * =========================
         * YEAR IN BRACKETS
         * =========================
         *
         * Alpha Gang (2026)
         * Alpha Gang [2026]
         * Alpha Gang «2026»
         * Alpha Gang "2026"
         * Alpha Gang '2026'
         * Alpha Gang <<2026>>
         * Alpha Gang <2026>
         *
         * ВАЖНО:
         * эта проверка находится ДО ID.
         * =========================
         */

        const yearMatch =
            word.match(
                /^(?:\((\d{4})\)|\[(\d{4})\]|«(\d{4})»|"(\d{4})"|'(\d{4})'|<<(\d{4})>>|<(\d{4})>)$/
            )

        if (yearMatch) {

            const year =
                Number(
                    yearMatch
                        .slice(1)
                        .find(Boolean)
                )

            if (
                year >= 1900
                && year <= new Date().getFullYear() + 5
            ) {

                years.push(year)

                continue
            }
        }


        /*
         * =========================
         * PERSON ID / MEDIA ID
         * =========================
         *
         * 2219
         * 634649
         *
         * Обычные числа по-прежнему
         * считаются ID.
         * =========================
         */

        if (/^\d+$/.test(cleanWord)) {

            id.push(
                Number(cleanWord)
            )

            continue
        }


        /*
         * =========================
         * YEAR WITHOUT BRACKETS
         * =========================
         *
         * Оставляем старую логику:
         *
         * 2026
         *
         * считается ID.
         *
         * Годом считается только:
         *
         * (2026)
         * [2026]
         * «2026»
         * "2026"
         * '2026'
         * <<2026>>
         * <2026>
         *
         * =========================
         */


        /*
         * =========================
         * RATING
         * =========================
         */

        if (/^>\d+(\.\d+)?$/.test(word)) {

            vote =
                Number(
                    word.slice(1)
                )

            continue
        }


        /*
         * =========================
         * TEXT
         * =========================
         */

        text.push(word)
    }

    return {
        from: bookmarksOfUserId,

        text:
            text.join(" "),

        filters: {
            genres,
            id,
            personJob,
            years,
            providers,
            countries,
            companies,
            mediaTypes,
            contentType,
            creditType,
            sort,
            vote
        }
    }
}

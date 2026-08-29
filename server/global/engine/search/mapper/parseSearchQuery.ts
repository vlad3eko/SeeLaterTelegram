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


    let isCollection: boolean = false
    let bookmarksOfUserId:
        number | null = null

    const mediaTypes:
        ("movie" | "tv" | "person")[] = []

    let creditType:
        "cast" | "crew" | undefined

    let sort: string | undefined
    let vote: number | undefined

    const text: string[] = []

    /*
     * Числа пока не записываем сразу в ID.
     *
     * Сначала собираем их отдельно.
     *
     * Это нужно для:
     *
     * 12 лет рабства
     * 634649 #cast
     * 124265 #person
     *
     * В первом случае 12 должен стать частью текста.
     * Во втором и третьем — ID.
     */

    const numericTokens: {
        value: number
        word: string
    }[] = []


    for (const word of words) {

        /*
         * =========================
         * TAG
         * =========================
         */

        if (word.startsWith("#")) {

            const tag =
                word
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

            if (['collection', 'коллекция'].includes(tag)) {
                isCollection = true
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
         * Только такие числа считаются годом.
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
                year >= 1900 &&
                year <= new Date().getFullYear() + 5
            ) {

                years.push(year)

                continue
            }
        }


        /*
         * =========================
         * PURE NUMBER
         * =========================
         *
         * Пока НЕ определяем его как ID.
         *
         * Сначала посмотрим, есть ли в запросе
         * обычный текст.
         * =========================
         */

        if (/^\d+$/.test(word)) {

            numericTokens.push({
                value: Number(word),
                word
            })

            continue
        }


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


    /*
     * ==================================================
     * RESOLVE NUMERIC TOKENS
     * ==================================================
     *
     * Здесь находится ключевое исправление.
     *
     * Если есть обычный текст:
     *
     * 12 лет рабства
     *      ↓
     * text = "12 лет рабства"
     * id = []
     *
     * Если обычного текста нет:
     *
     * 634649 #cast
     *      ↓
     * id = [634649]
     *
     * 124265 #person
     *      ↓
     * id = [124265]
     *
     * Обычный числовой поиск:
     *
     * 634649
     *      ↓
     * id = [634649]
     *
     * Таким образом старое поведение ID сохраняется.
     * ==================================================
     */

    if (text.length > 0) {

        /*
         * Если в запросе уже есть обычный текст,
         * числа считаем частью названия.
         */

        for (const numericToken of numericTokens) {

            text.unshift(
                numericToken.word
            )
        }

    } else {

        /*
         * Если текста нет,
         * числа остаются ID.
         */

        for (const numericToken of numericTokens) {

            id.push(
                numericToken.value
            )
        }
    }


    return {
        from: bookmarksOfUserId,
        text: text.join(" "),
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
            vote,
            isCollection,
        }
    }
}

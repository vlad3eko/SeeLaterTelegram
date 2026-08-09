import {ContentStrategy} from "~/utils/engines/content/strategy/enums";
export const executeDataProvider = async (strategy: string, userId: number) => {

    switch(strategy) {

        case ContentStrategy.WHAT_WATCH_TODAY:
            return (`Сегодня смотрим эти 20 фильмов, запрос от пользователя: ${userId}`)

        case ContentStrategy.RELEASE_THIS_MONTH:
            return `Релизы этого месяца, запрос от пользователя: ${userId}`;

        case ContentStrategy.RELEASE_TODAY:
            return `Релизы за сегодня, запрос от пользователя: ${userId}`;

        case ContentStrategy.RELEASE_NEXT_WEEK:
            return `Релизы следующей недели, запрос от пользователя: ${userId}`;

        case ContentStrategy.MOST_WAITING_MOVIE:
            return `Самые ожидаемые фильмы, запрос от пользователя: ${userId}`;

        case ContentStrategy.MOST_WAITING_SERIES:
            return `Самые ожидаемые сериалы, запрос от пользователя: ${userId}`;

        case ContentStrategy.MOST_WAITING_CARTOON:
            return `Самые ожидаемые мультфильмы, запрос от пользователя: ${userId}`;

        case ContentStrategy.BEST_MOVIES_BY_ACTOR:
            return `Лучшие фильмы по актеру, запрос от пользователя: ${userId}`;

        case ContentStrategy.BEST_MOVIES_BY_GENRE:
            return `Лучшие фильмы по жанру, запрос от пользователя: ${userId}`;

        case ContentStrategy.LOOKALIKE_AT_MEDIA_NAME:
            return `Похожие медиа по названию, запрос от пользователя: ${userId}`;

        default:
            return {
                results:[]
            }
    }
}

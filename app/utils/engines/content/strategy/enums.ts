export enum ContentStrategy {
    WHAT_WATCH_TODAY = "WHAT_WATCH_TODAY",
    RELEASE_THIS_MONTH = 'RELEASE_THIS_MONTH',
    RELEASE_LAST_WEEK = 'RELEASE_LAST_WEEK',
    RELEASE_TODAY = 'RELEASE_TODAY',
    RELEASE_NEXT_WEEK = 'RELEASE_NEXT_WEEK',
    MOST_WAITING_MOVIE = 'MOST_WAITING_MOVIE',
    MOST_WAITING_SERIES = 'MOST_WAITING_SERIES',
    MOST_WAITING_CARTOON = 'MOST_WAITING_CARTOON',
    BEST_MOVIES_BY_ACTOR = 'BEST_MOVIES_BY_ACTOR',
    BEST_MOVIES_BY_GENRE = 'BEST_MOVIES_BY_GENRE',
    LOOKALIKE_AT_MEDIA_NAME = 'LOOKALIKE_AT_MOVIE_NAME',
}

export enum ContentTelegramMenu {
    START = 'START',
    RELEASE = 'RELEASE',
    WAITING = 'WAITING',
    BEST = 'BEST',
}

// Связываем стратегии с их текстами в одном месте
export const STRATEGY_LABELS: Record<ContentStrategy, string> = {
    [ContentStrategy.WHAT_WATCH_TODAY]: "Что посмотреть сегодня",
    [ContentStrategy.RELEASE_THIS_MONTH]: "Этот месяц",
    [ContentStrategy.RELEASE_LAST_WEEK]: "Прошлой недели",
    [ContentStrategy.RELEASE_TODAY]: "Этой недели",
    [ContentStrategy.RELEASE_NEXT_WEEK]: "Следующей недели",
    [ContentStrategy.MOST_WAITING_MOVIE]: "Фильмы",
    [ContentStrategy.MOST_WAITING_SERIES]: "Сериалы",
    [ContentStrategy.MOST_WAITING_CARTOON]: "Мультфильмы",
    [ContentStrategy.BEST_MOVIES_BY_ACTOR]: "Лучшие роли актёра",
    [ContentStrategy.BEST_MOVIES_BY_GENRE]: "Лучшее по жанрам",
    [ContentStrategy.LOOKALIKE_AT_MEDIA_NAME]: "Похожее по названию",
}

// Описываем структуру наших подменю массивами ключей
export const SUBMENUS = {
    [ContentTelegramMenu.RELEASE]: [
        ContentStrategy.RELEASE_THIS_MONTH,
        ContentStrategy.RELEASE_TODAY,
        ContentStrategy.RELEASE_LAST_WEEK,
        ContentStrategy.RELEASE_NEXT_WEEK,
    ],
    [ContentTelegramMenu.WAITING]: [
        ContentStrategy.MOST_WAITING_MOVIE,
        ContentStrategy.MOST_WAITING_SERIES,
        ContentStrategy.MOST_WAITING_CARTOON,
    ],
    [ContentTelegramMenu.BEST]: [
        ContentStrategy.BEST_MOVIES_BY_ACTOR,
        ContentStrategy.BEST_MOVIES_BY_GENRE,
    ]
} as const



/**
 * Справочники подборок /g: жанры, теги, разделы, интервалы.
 * Числа (id TMDB) замерены 17.11.2026 — см. TASKS.md, раздел «ТЕКУЩАЯ ЗАДАЧА: подборки /g».
 */

export type MediaType = 'movie' | 'tv'

export type Direction = 'released' | 'upcoming'

/** Условие TMDB для фильмов или для сериалов: жанр или keyword (там, где жанра нет). */
export type TmdbCondition = {genre: number} | {keyword: number}

export type Genre = {
    key: string
    label: string
    movie: TmdbCondition
    tv: TmdbCondition
}

/**
 * 20 жанров, общих для фильмов и сериалов. У сериалов в TMDB часть жанров склеена
 * (боевик+приключения, фантастика+фэнтези) или отсутствует (ужасы, триллер, мелодрама) —
 * тогда подставляется keyword. Анимации здесь нет: у неё свои разделы.
 */
export const GENRES: Genre[] = [
    {key: 'action', label: 'Боевик', movie: {genre: 28}, tv: {genre: 10759}},
    {key: 'adventure', label: 'Приключения', movie: {genre: 12}, tv: {genre: 10759}},
    {key: 'comedy', label: 'Комедия', movie: {genre: 35}, tv: {genre: 35}},
    {key: 'drama', label: 'Драма', movie: {genre: 18}, tv: {genre: 18}},
    {key: 'crime', label: 'Криминал', movie: {genre: 80}, tv: {genre: 80}},
    {key: 'mystery', label: 'Детектив', movie: {genre: 9648}, tv: {genre: 9648}},
    {key: 'thriller', label: 'Триллер', movie: {genre: 53}, tv: {keyword: 316362}},
    {key: 'horror', label: 'Ужасы', movie: {genre: 27}, tv: {keyword: 315058}},
    {key: 'scifi', label: 'Фантастика', movie: {genre: 878}, tv: {genre: 10765}},
    {key: 'fantasy', label: 'Фэнтези', movie: {genre: 14}, tv: {genre: 10765}},
    {key: 'romance', label: 'Мелодрама', movie: {genre: 10749}, tv: {keyword: 9840}},
    {key: 'supernatural', label: 'Мистика', movie: {keyword: 6152}, tv: {keyword: 6152}},
    {key: 'family', label: 'Семейный', movie: {genre: 10751}, tv: {genre: 10751}},
    {key: 'war', label: 'Военный', movie: {genre: 10752}, tv: {genre: 10768}},
    {key: 'history', label: 'Исторический', movie: {genre: 36}, tv: {keyword: 15060}},
    {key: 'biography', label: 'Биография', movie: {keyword: 5565}, tv: {keyword: 5565}},
    {key: 'sport', label: 'Спорт', movie: {keyword: 6075}, tv: {keyword: 6075}},
    {key: 'music', label: 'Музыка', movie: {genre: 10402}, tv: {keyword: 4344}},
    {key: 'western', label: 'Вестерн', movie: {genre: 37}, tv: {genre: 37}},
    {key: 'documentary', label: 'Документальный', movie: {genre: 99}, tv: {genre: 99}}
]

export type Tag = {
    key: string
    label: string
    group: 'horror' | 'scifi' | 'crime' | 'life'
    keyword: number
    /** Известных фильмов (≥300 голосов) и сериалов (≥100 голосов) с тегом на 17.11.2026. */
    movies: number
    series: number
}

export const TAG_GROUPS: Record<Tag['group'], string> = {
    horror: 'Ужасы и мистика',
    scifi: 'Фантастика',
    crime: 'Криминал и экшен',
    life: 'Жизнь и история'
}

/** Утверждённый владельцем список тегов (17.11.2026), TMDB keywords. */
export const TAGS: Tag[] = [
    {key: 'serial_killer', label: 'Маньяки', group: 'horror', keyword: 10714, movies: 304, series: 67},
    {key: 'slasher', label: 'Слэшер', group: 'horror', keyword: 12339, movies: 183, series: 10},
    {key: 'monster', label: 'Монстры', group: 'horror', keyword: 1299, movies: 136, series: 26},
    {key: 'zombie', label: 'Зомби', group: 'horror', keyword: 12377, movies: 134, series: 21},
    {key: 'ghost', label: 'Призраки', group: 'horror', keyword: 162846, movies: 126, series: 35},
    {key: 'vampire', label: 'Вампиры', group: 'horror', keyword: 3133, movies: 105, series: 36},
    {key: 'demon', label: 'Демоны', group: 'horror', keyword: 15001, movies: 104, series: 21},
    {key: 'witch', label: 'Ведьмы', group: 'horror', keyword: 616, movies: 103, series: 31},
    {key: 'haunted_house', label: 'Дом с привидениями', group: 'horror', keyword: 3358, movies: 81, series: 12},
    {key: 'werewolf', label: 'Оборотни', group: 'horror', keyword: 12564, movies: 60, series: 18},
    {key: 'cult', label: 'Культы', group: 'horror', keyword: 6158, movies: 49, series: 21},
    {key: 'possession', label: 'Одержимость', group: 'horror', keyword: 161261, movies: 47, series: 6},

    {key: 'dystopia', label: 'Антиутопия', group: 'scifi', keyword: 4565, movies: 244, series: 34},
    {key: 'superhero', label: 'Супергерои', group: 'scifi', keyword: 9715, movies: 198, series: 77},
    {key: 'alien', label: 'Пришельцы', group: 'scifi', keyword: 9951, movies: 173, series: 58},
    {key: 'time_travel', label: 'Путешествия во времени', group: 'scifi', keyword: 4379, movies: 142, series: 73},
    {key: 'magic', label: 'Магия', group: 'scifi', keyword: 2343, movies: 123, series: 48},
    {key: 'post_apocalypse', label: 'Постапокалипсис', group: 'scifi', keyword: 4458, movies: 94, series: 38},
    {key: 'ai', label: 'Искусственный интеллект', group: 'scifi', keyword: 310, movies: 82, series: 29},
    {key: 'alien_invasion', label: 'Вторжение пришельцев', group: 'scifi', keyword: 14909, movies: 78, series: 25},
    {key: 'space', label: 'Космос', group: 'scifi', keyword: 9882, movies: 73, series: 43},
    {key: 'robot', label: 'Роботы', group: 'scifi', keyword: 14544, movies: 71, series: 20},
    {key: 'cyberpunk', label: 'Киберпанк', group: 'scifi', keyword: 12190, movies: 48, series: 8},
    {key: 'mutant', label: 'Мутанты', group: 'scifi', keyword: 1852, movies: 45, series: 7},

    {key: 'martial_arts', label: 'Боевые искусства', group: 'crime', keyword: 779, movies: 255, series: 25},
    {key: 'kidnapping', label: 'Похищение', group: 'crime', keyword: 1930, movies: 216, series: 17},
    {key: 'detective', label: 'Детективы', group: 'crime', keyword: 703, movies: 188, series: 109},
    {key: 'prison', label: 'Тюрьма', group: 'crime', keyword: 378, movies: 181, series: 23},
    {key: 'gangster', label: 'Гангстеры', group: 'crime', keyword: 3149, movies: 163, series: 17},
    {key: 'spy', label: 'Шпионы', group: 'crime', keyword: 470, movies: 127, series: 37},
    {key: 'assassin', label: 'Киллеры', group: 'crime', keyword: 782, movies: 115, series: 6},
    {key: 'conspiracy', label: 'Заговор', group: 'crime', keyword: 10410, movies: 113, series: 54},
    {key: 'heist', label: 'Ограбление', group: 'crime', keyword: 10051, movies: 108, series: 13},
    {key: 'mafia', label: 'Мафия', group: 'crime', keyword: 10391, movies: 64, series: 15},

    {key: 'true_story', label: 'По реальным событиям', group: 'life', keyword: 9672, movies: 642, series: 79},
    {key: 'revenge', label: 'Месть', group: 'life', keyword: 9748, movies: 397, series: 67},
    {key: 'coming_of_age', label: 'Взросление', group: 'life', keyword: 10683, movies: 216, series: 56},
    {key: 'ww2', label: 'Вторая мировая', group: 'life', keyword: 1956, movies: 195, series: 31},
    {key: 'survival', label: 'Выживание', group: 'life', keyword: 10349, movies: 179, series: 53},
    {key: 'christmas', label: 'Рождество', group: 'life', keyword: 207317, movies: 161, series: 9},
    {key: 'psychological', label: 'Психологический триллер', group: 'life', keyword: 12565, movies: 113, series: 47},
    {key: 'cold_war', label: 'Холодная война', group: 'life', keyword: 2106, movies: 50, series: 9},
    {key: 'vietnam', label: 'Война во Вьетнаме', group: 'life', keyword: 2957, movies: 41, series: 5}
]

/** В разделах сериалов не показываются теги, у которых меньше стольких известных сериалов. */
export const MIN_SERIES_PER_TAG = 10

/**
 * Разделы этапа 1 (правка владельца 18.11). Мультфильмы, мультсериалы и аниме — этап 2.
 *   movies            — фильмы; «Уже вышли / Скоро» выбирается отдельным шагом;
 *   series_completed  — «Вышли полностью»: сериал закончен, последняя серия в выбранном периоде;
 *   series_new        — «Новые серии/сезоны»: в периоде вышла первая серия сериала или нового сезона;
 *   series_upcoming   — «Скоро»: сериал ещё не вышел, первая серия в выбранном периоде.
 */
export type SectionKey = 'movies' | 'series_completed' | 'series_new' | 'series_upcoming'

export type Section = {
    key: SectionKey
    label: string
    mediaType: MediaType
    contentType: 'movie' | 'series'
    /** Направление периода, если раздел задаёт его сам (у сериалов); у фильмов выбирается. */
    direction?: Direction
}

export const SECTIONS: Record<SectionKey, Section> = {
    movies: {key: 'movies', label: 'Фильмы', mediaType: 'movie', contentType: 'movie'},
    series_completed: {key: 'series_completed', label: 'Вышли полностью', mediaType: 'tv', contentType: 'series', direction: 'released'},
    series_new: {key: 'series_new', label: 'Новые серии/сезоны', mediaType: 'tv', contentType: 'series', direction: 'released'},
    series_upcoming: {key: 'series_upcoming', label: 'Скоро', mediaType: 'tv', contentType: 'series', direction: 'upcoming'}
}

/** Тайтлы старше этой даты в топы не попадают (решение владельца 18.11). */
export const MIN_RELEASE_DATE = '1985-01-01'

export type YearRangeKey = 'y1985' | 'y2000' | 'y2015'

/** Блок «Год» фильтра: выбирается не больше одного диапазона (год выхода фильма / начала сериала). */
export const YEAR_RANGES: Array<{key: YearRangeKey, label: string, from: string, to?: string}> = [
    {key: 'y1985', label: '1985–2000', from: '1985-01-01', to: '1999-12-31'},
    {key: 'y2000', label: '2000–2015', from: '2000-01-01', to: '2014-12-31'},
    {key: 'y2015', label: '2015–…', from: '2015-01-01'}
]

export const yearRangeByKey = (key: string | undefined) => YEAR_RANGES.find(range => range.key === key)

/** Жанры TMDB, которые не попадают в выдачу разделов: анимация (свои разделы), новости, реалити, ток-шоу. */
export const EXCLUDED_GENRES: Record<MediaType, number[]> = {
    movie: [16, 10770],
    tv: [16, 10763, 10764, 10767]
}

/**
 * Страны, чьи тайтлы в подборки не берём (решение владельца 18.11): Россия и Индия.
 * TMDB не умеет исключать страну в discover (without_origin_country молча игнорируется),
 * поэтому фильтруем сами: у сериалов — origin_country из выдачи, у фильмов (страны в выдаче нет) —
 * по языку оригинала: русский и языки Индии.
 */
export const EXCLUDED_COUNTRIES = ['RU', 'IN']
export const EXCLUDED_LANGUAGES = ['ru', 'hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu', 'or', 'as', 'ur']

export const isExcludedOrigin = (item: {origin_country?: string[], original_language?: string}) =>
    (item.origin_country ?? []).some(country => EXCLUDED_COUNTRIES.includes(country)) ||
    EXCLUDED_LANGUAGES.includes(String(item.original_language ?? ''))

/** Диапазон «Год» целиком в прошлом: у фильмов такой выбор означает «Уже вышли». */
export const isPastYearRange = (key: string | undefined, today = new Date().toISOString().slice(0, 10)) => {
    const range = yearRangeByKey(key)
    return Boolean(range?.to && range.to < today)
}


export type PeriodKey =
    | 'all' | 'y5' | 'year' | 'm6' | 'm3' | 'd30'
    | 'announced' | 'year_end' | 'next_m6' | 'next_m3' | 'next_d30'

export type Period = {
    key: PeriodKey
    label: string
    direction: Direction
}

export const PERIODS: Period[] = [
    {key: 'all', label: 'За всё время', direction: 'released'},
    {key: 'y5', label: 'Последние 5 лет', direction: 'released'},
    {key: 'year', label: 'Этот год', direction: 'released'},
    {key: 'm6', label: 'Последние полгода', direction: 'released'},
    {key: 'm3', label: 'Последние 3 месяца', direction: 'released'},
    {key: 'd30', label: 'Последние 30 дней', direction: 'released'},
    {key: 'announced', label: 'Всё анонсированное', direction: 'upcoming'},
    {key: 'year_end', label: 'До конца года', direction: 'upcoming'},
    {key: 'next_m6', label: 'Ближайшие полгода', direction: 'upcoming'},
    {key: 'next_m3', label: 'Ближайшие 3 месяца', direction: 'upcoming'},
    {key: 'next_d30', label: 'Ближайшие 30 дней', direction: 'upcoming'}
]

export const periodByKey = (key: string): Period | undefined => PERIODS.find(period => period.key === key)
export const genreByKey = (key: string): Genre | undefined => GENRES.find(genre => genre.key === key)
export const tagByKey = (key: string): Tag | undefined => TAGS.find(tag => tag.key === key)

/** Теги, доступные в разделе (у сериалов скрыты редкие). */
export const tagsForSection = (section: Section): Tag[] =>
    section.mediaType === 'tv' ? TAGS.filter(tag => tag.series >= MIN_SERIES_PER_TAG) : TAGS

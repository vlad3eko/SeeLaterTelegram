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
    /** Нет у жанров, которые показываются только у сериалов (TV_GENRES). */
    movie?: TmdbCondition
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

/**
 * Жанры разделов сериалов — список жанров сериалов TMDB как есть (решение владельца 19.11:
 * склеенные «Фантастика» и «Фэнтези» давали одно и то же). Без новостей, реалити и ток-шоу
 * (EXCLUDED_GENRES не пускает их в выдачу) и без мультфильмов (свои разделы на этапе 2).
 * Общие с фильмами жанры — с теми же ключами, что в GENRES.
 */
export const TV_GENRES: Genre[] = [
    {key: 'tv_action', label: 'Боевик и приключения', tv: {genre: 10759}},
    {key: 'western', label: 'Вестерн', movie: {genre: 37}, tv: {genre: 37}},
    {key: 'tv_war', label: 'Война и политика', tv: {genre: 10768}},
    {key: 'mystery', label: 'Детектив', movie: {genre: 9648}, tv: {genre: 9648}},
    {key: 'tv_kids', label: 'Детский', tv: {genre: 10762}},
    {key: 'documentary', label: 'Документальный', movie: {genre: 99}, tv: {genre: 99}},
    {key: 'drama', label: 'Драма', movie: {genre: 18}, tv: {genre: 18}},
    {key: 'comedy', label: 'Комедия', movie: {genre: 35}, tv: {genre: 35}},
    {key: 'crime', label: 'Криминал', movie: {genre: 80}, tv: {genre: 80}},
    {key: 'tv_soap', label: 'Мыльная опера', tv: {genre: 10766}},
    {key: 'tv_scifi', label: 'НФ и фэнтези', tv: {genre: 10765}},
    {key: 'family', label: 'Семейный', movie: {genre: 10751}, tv: {genre: 10751}}
]

export type Tag = {
    key: string
    label: string
    group: 'horror' | 'scifi' | 'crime' | 'life'
    /**
     * Понятие, а не одно слово: ключевые слова TMDB через «или», первое — основное. Слова на TMDB
     * ставят пользователи вразнобой («Квест Вижна» помечен «marvel cinematic universe», но не
     * «superhero»), поэтому синонимы подобраны аудитом 19.11.2026 (замер и отсев шумных слов).
     */
    keywords: number[]
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
    {key: 'serial_killer', label: 'Маньяки', group: 'horror', keywords: [10714, 14676, 161814, 220455, 305666], movies: 304, series: 67},
    {key: 'slasher', label: 'Слэшер', group: 'horror', keywords: [12339, 233450], movies: 183, series: 10},
    {key: 'monster', label: 'Монстры', group: 'horror', keywords: [1299, 11100, 161791, 158126, 289108, 33696, 210614], movies: 136, series: 26},
    {key: 'zombie', label: 'Зомби', group: 'horror', keywords: [12377, 186565], movies: 134, series: 21},
    {key: 'ghost', label: 'Призраки', group: 'horror', keywords: [162846, 10224, 41411, 3350, 256908], movies: 126, series: 35},
    {key: 'vampire', label: 'Вампиры', group: 'horror', keywords: [3133, 261274, 9259, 9668, 272742], movies: 105, series: 36},
    {key: 'demon', label: 'Демоны', group: 'horror', keywords: [15001, 14999, 186425, 5810, 305648], movies: 104, series: 21},
    {key: 'witch', label: 'Ведьмы', group: 'horror', keywords: [616, 40931, 3884, 162806, 184114, 177901], movies: 103, series: 31},
    {key: 'haunted_house', label: 'Дом с привидениями', group: 'horror', keywords: [3358, 179433], movies: 81, series: 12},
    {key: 'werewolf', label: 'Оборотни', group: 'horror', keywords: [12564, 228001], movies: 60, series: 18},
    {key: 'cult', label: 'Культы', group: 'horror', keywords: [6158, 163055, 162766, 159028, 173162], movies: 49, series: 21},
    {key: 'possession', label: 'Одержимость', group: 'horror', keywords: [161261, 2626, 159940], movies: 47, series: 6},

    {key: 'dystopia', label: 'Антиутопия', group: 'scifi', keywords: [4565], movies: 244, series: 34},
    {key: 'superhero', label: 'Супергерои', group: 'scifi', keywords: [9715, 180547, 155030, 213104, 180734, 229266, 359527, 329136, 265979, 312528], movies: 198, series: 77},
    {key: 'alien', label: 'Пришельцы', group: 'scifi', keywords: [9951, 9739, 160515, 12553, 163252, 161293, 229652], movies: 173, series: 58},
    {key: 'time_travel', label: 'Путешествия во времени', group: 'scifi', keywords: [4379, 10854, 5455, 208757], movies: 142, series: 73},
    {key: 'magic', label: 'Магия', group: 'scifi', keywords: [2343, 177912, 234213, 4252, 5147, 10821, 291549, 249692], movies: 123, series: 48},
    {key: 'post_apocalypse', label: 'Постапокалипсис', group: 'scifi', keywords: [4458, 359337, 186565], movies: 94, series: 38},
    {key: 'ai', label: 'Искусственный интеллект', group: 'scifi', keywords: [310], movies: 82, series: 29},
    {key: 'alien_invasion', label: 'Вторжение пришельцев', group: 'scifi', keywords: [14909, 6968, 197327, 192962], movies: 78, series: 25},
    {key: 'space', label: 'Космос', group: 'scifi', keywords: [9882, 3801, 161176, 14626, 252937, 195114, 252634, 3388, 4040, 2902, 3386], movies: 73, series: 43},
    {key: 'robot', label: 'Роботы', group: 'scifi', keywords: [14544, 803, 10046, 679, 10891, 1373, 220903, 11272, 211713, 287333], movies: 71, series: 20},
    {key: 'cyberpunk', label: 'Киберпанк', group: 'scifi', keywords: [12190], movies: 48, series: 8},
    {key: 'mutant', label: 'Мутанты', group: 'scifi', keywords: [1852, 2766, 233300, 234268, 158253], movies: 45, series: 7},

    {key: 'martial_arts', label: 'Боевые искусства', group: 'crime', keywords: [779, 780, 9917, 3436, 156159, 14731, 14941, 185466, 156162], movies: 255, series: 25},
    {key: 'kidnapping', label: 'Похищение', group: 'crime', keywords: [1930, 170865, 235261, 265839], movies: 216, series: 17},
    {key: 'detective', label: 'Детективы', group: 'crime', keywords: [703, 155790, 15167, 11168, 180668, 160342, 1735, 161982, 157241], movies: 188, series: 109},
    {key: 'prison', label: 'Тюрьма', group: 'crime', keywords: [378, 9777, 9774, 191047, 169271, 3859, 5643, 15278, 156257], movies: 181, series: 23},
    {key: 'gangster', label: 'Гангстеры', group: 'crime', keywords: [3149, 10291, 2987, 170212], movies: 163, series: 17},
    {key: 'spy', label: 'Шпионы', group: 'crime', keywords: [470, 591, 4289, 5265, 217282, 18117, 14618, 212801, 332774, 213102, 190654, 298577], movies: 127, series: 37},
    {key: 'assassin', label: 'Киллеры', group: 'crime', keywords: [782, 2708, 177964, 12367, 206041], movies: 115, series: 6},
    {key: 'conspiracy', label: 'Заговор', group: 'crime', keywords: [10410, 9665, 298530, 181635, 11208, 162300, 235579, 298532], movies: 113, series: 54},
    {key: 'heist', label: 'Ограбление', group: 'crime', keywords: [10051, 15363, 2492, 196917, 159413, 191845, 3607, 40903, 177438, 156120, 188665, 315792], movies: 108, series: 13},
    {key: 'mafia', label: 'Мафия', group: 'crime', keywords: [10391, 11578, 6220, 206594, 166462, 5964, 217064, 155538, 231149], movies: 64, series: 15},

    {key: 'true_story', label: 'По реальным событиям', group: 'life', keywords: [9672, 328926], movies: 642, series: 79},
    {key: 'revenge', label: 'Месть', group: 'life', keywords: [9748, 232766, 252204, 191045, 15095, 320594], movies: 397, series: 67},
    {key: 'coming_of_age', label: 'Взросление', group: 'life', keywords: [10683, 704, 234042], movies: 216, series: 56},
    {key: 'ww2', label: 'Вторая мировая', group: 'life', keywords: [1956, 1739, 189422, 279911, 1799, 11489], movies: 195, series: 31},
    {key: 'survival', label: 'Выживание', group: 'life', keywords: [10349, 9743, 336497, 50009, 161240, 353736], movies: 179, series: 53},
    {key: 'christmas', label: 'Рождество', group: 'life', keywords: [207317, 1991, 260365, 1441, 186466, 12200, 272698, 193048], movies: 161, series: 9},
    {key: 'psychological', label: 'Психологический триллер', group: 'life', keywords: [12565], movies: 113, series: 47},
    {key: 'cold_war', label: 'Холодная война', group: 'life', keywords: [2106, 295538], movies: 50, series: 9},
    {key: 'vietnam', label: 'Война во Вьетнаме', group: 'life', keywords: [2957], movies: 41, series: 5}
]

/** В разделах сериалов не показываются теги, у которых меньше стольких известных сериалов. */
export const MIN_SERIES_PER_TAG = 10

/**
 * Разделы этапа 1 (правка владельца 18.11). Мультфильмы, мультсериалы и аниме — этап 2.
 *   movies            — фильмы; «Уже вышли / Скоро» выбирается отдельным шагом;
 *   series_completed  — «Вышли полностью»: сериал закончен, последняя серия в выбранном периоде;
 *   series_new        — «Новые серии/сезоны»: в периоде выходили серии (премьера, новый сезон или очередные серии);
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
export const genreByKey = (key: string): Genre | undefined =>
    GENRES.find(genre => genre.key === key) ?? TV_GENRES.find(genre => genre.key === key)

/** Жанры, которые показываются в разделе: у сериалов — жанры сериалов TMDB. */
export const genresForSection = (section: Section): Genre[] => section.mediaType === 'tv' ? TV_GENRES : GENRES
export const tagByKey = (key: string): Tag | undefined => TAGS.find(tag => tag.key === key)

/** Теги, доступные в разделе (у сериалов скрыты редкие). */
export const tagsForSection = (section: Section): Tag[] =>
    section.mediaType === 'tv' ? TAGS.filter(tag => tag.series >= MIN_SERIES_PER_TAG) : TAGS

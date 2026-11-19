import type {MediaType, ShelfKey} from '#server/global/engine/collections/shelves'
import type {SectionKey} from '#server/global/engine/collections/catalog'

/**
 * Связки подборок /g: готовая подборка под желание зрителя («Кто убийца?», «Посмотреть за
 * выходные») вместо жанра. ТЗ — TASKS.md «ТЗ: полки, связки, судья, „Похожее“».
 *
 * Связка — запись справочника, не код: правила отбора TMDB, где применима, сортировка, порог
 * качества и (у судимых) рубрика для LLM-судьи. Ключевые слова подобраны аудитом 19.11.2026
 * (скрипты bsyn.mjs / baudit.mjs, отчёт «Связки подборок /g»): шумные слова убраны.
 *
 * Виды:
 *   auto   — только TMDB; если судья уже вынес вердикты по связке, «нет» убирает шум;
 *   judged — TMDB находит кандидатов, судья подтверждает (эмоции, финалы, целевая аудитория).
 *            В подборку идут только тайтлы с вердиктом «да».
 */

export type TmdbRef = {mediaType: MediaType, id: number}

export type Range = {min?: number, max?: number}

export type BundleProps = {
    /** Длительность фильма, минуты. */
    runtime?: Range
    /** Тип сериала TMDB «Miniseries». */
    tvType?: 'miniseries'
    /** Статус сериала: Ended, Canceled, Returning Series… */
    status?: string[]
    /** Число серий сериала (по карточке). */
    episodes?: Range
    /** Средняя оценка TMDB. */
    rating?: Range
    /** Число голосов: множитель к порогу «известного» на полке (0.1 — в десять раз меньше). */
    votes?: {min?: number, max?: number}
    /** Дата выхода (фильм) или начала (сериал): с — по. */
    released?: {from?: string, to?: string}
}

export type GenreRule = {anyOf?: number[], allOf?: number[], exclude?: number[]}

export type BundleCriteria = {
    /** Понятия: внутри — «или» (синонимы), между понятиями — «и». */
    concepts?: number[][]
    /** Тайтл с любым из этих слов не подходит. */
    exclude?: number[]
    /** Слова, которые поднимают тайтл выше при сортировке по релевантности. */
    boost?: number[]
    /** Жанры по типу TMDB (у фильмов и сериалов разные id). */
    genres?: Partial<Record<MediaType, GenreRule>>
    props?: BundleProps
}

export type RubricCriterion = {
    key: string
    label: string
    /** Что означают 0, 1 и 2 балла. */
    levels: [string, string, string]
}

/** Рубрика судьи: что обязательно, что недостаточно, что исключает, как считать баллы. */
export type Rubric = {
    version: number
    goal: string
    criteria: RubricCriterion[]
    /** Совпадения, которых недостаточно (частые ошибки). */
    notEnough: string[]
    /** Что сразу исключает тайтл. */
    exclusions: string[]
    /** Когда отвечать «недостаточно данных». */
    insufficient: string
    /** «Да» — от стольких баллов; «пограничный» — от borderline. */
    passScore: number
    borderlineScore: number
}

export type Bundle = {
    key: string
    /** 1–4 слова: заголовок подборки вместо «Топ-10». */
    title: string
    /** Строка-обещание под заголовком. */
    lead: string
    emoji: string
    kind: 'auto' | 'judged'
    /** Где связка доступна (полки) и в каких разделах. */
    shelves: ShelfKey[]
    sections?: SectionKey[]
    criteria: BundleCriteria
    ranking: 'relevance' | 'weighted' | 'popular'
    /** Меньше стольких тайтлов с трейлером — подборку не показываем. */
    minResults: number
    /** Судимые: рубрика, якоря (поиск кандидатов через «Похожее») и контрольные тайтлы. */
    rubric?: Rubric
    anchors?: TmdbRef[]
    controls?: {positive: TmdbRef[], negative: TmdbRef[]}
}

/** Разделы, где связки имеют смысл: уже вышедшее (не «Скоро»). */
export const BUNDLE_SECTIONS: SectionKey[] = ['movies', 'series_completed', 'series_new', 'series_seasons']

const LIVE: ShelfKey[] = ['movie', 'series']
const MOVIE_SHELVES: ShelfKey[] = ['movie', 'animated_movie', 'anime_movie', 'donghua_movie']
const TV_SHELVES: ShelfKey[] = ['series', 'animated_series', 'anime_series', 'donghua_series']
const ALL: ShelfKey[] = [...MOVIE_SHELVES, ...TV_SHELVES]

const m = (id: number): TmdbRef => ({mediaType: 'movie', id})
const tv = (id: number): TmdbRef => ({mediaType: 'tv', id})

/* ------------------------------ Рубрики судимых связок ------------------------------ */

const TWIST: Rubric = {
    version: 1,
    goal: 'Произведения с существенным сюжетным поворотом ближе к финалу, который меняет понимание всего, что зритель видел до этого.',
    criteria: [
        {key: 'late_reveal', label: 'Раскрытие ближе к финалу', levels: ['раскрытия нет или оно в начале/середине', 'поворот во второй половине, но не в финале', 'ключевое раскрытие в финальной части']},
        {key: 'reinterpretation', label: 'Меняет смысл предыдущих событий', levels: ['не меняет', 'частично меняет (новая деталь, мотив)', 'полностью переворачивает понимание сюжета']},
        {key: 'evidence_of_twist', label: 'Поворот описан в источнике', levels: ['в досье нет описания финала', 'финал описан косвенно', 'досье прямо описывает раскрытие']}
    ],
    notEnough: [
        'обычный клиффхэнгер или открытый финал',
        'стандартное раскрытие личности злодея в детективе без переосмысления событий',
        'неожиданная смерть персонажа сама по себе',
        'жанр «триллер» или «детектив» без описания поворота'
    ],
    exclusions: ['поворот происходит в начале и задаёт завязку'],
    insufficient: 'В досье нет описания финала или раскрытия — ответь insufficient, не угадывай по памяти.',
    passScore: 5,
    borderlineScore: 3
}

const SAD_END: Rubric = {
    version: 1,
    goal: 'Произведения, в которых основная сюжетная линия заканчивается трагическим или существенно неблагоприятным исходом, без полноценного позитивного разрешения центрального конфликта. Оценивается концовка, а не общее настроение.',
    criteria: [
        {key: 'main_outcome', label: 'Исход главной сюжетной линии', levels: ['позитивный', 'смешанный или горько-сладкий', 'трагический: цель героя окончательно проваливается или он гибнет']},
        {key: 'irreversible_loss', label: 'Необратимые потери', levels: ['отсутствуют', 'незначительные или компенсированные', 'существенные и центральные для истории']},
        {key: 'final_resolution', label: 'Финальное эмоциональное разрешение', levels: ['надежда и позитив', 'горько-сладкое', 'отчаяние или отсутствие разрешения']}
    ],
    notEnough: [
        'мрачный сюжет, но герой побеждает',
        'смерть второстепенного персонажа при благополучном завершении главной линии',
        'много смертей по ходу действия при позитивной концовке',
        'жанр «драма» сам по себе'
    ],
    exclusions: ['главная линия завершается благополучно'],
    insufficient: 'Финал в досье не описан или открыт и неизвестно, что произошло — insufficient.',
    passScore: 5,
    borderlineScore: 3
}

const TEARJERKER: Rubric = {
    version: 1,
    goal: 'Произведения, центральная линия которых построена на эмоциональной потере: смерть близкого, неизлечимая болезнь, расставание навсегда, самопожертвование — история, рассчитанная на сопереживание до слёз.',
    criteria: [
        {key: 'central_loss', label: 'Потеря в центре истории', levels: ['нет', 'есть, но второстепенна', 'потеря или угроза потери — главная линия']},
        {key: 'attachment', label: 'Привязанность к героям', levels: ['история о действии, а не о людях', 'есть тёплые отношения', 'история строится на близких отношениях (семья, любовь, дружба, питомец)']},
        {key: 'emotional_climax', label: 'Эмоциональная кульминация', levels: ['нет', 'есть грустный эпизод', 'финал или кульминация — прощание, смерть, жертва']}
    ],
    notEnough: [
        'жестокие сцены и насилие',
        'наличие грустного персонажа',
        'гибель многих людей в боевике или катастрофе без личной истории'
    ],
    exclusions: ['комедия, где драма — фон'],
    insufficient: 'Сюжет описан слишком кратко, чтобы понять, есть ли потеря в центре, — insufficient.',
    passScore: 5,
    borderlineScore: 3
}

const FEELGOOD: Rubric = {
    version: 1,
    goal: 'Тёплые произведения, после которых становится лучше: доброжелательная атмосфера, позитивное развитие героев, надежда и благоприятный финал.',
    criteria: [
        {key: 'tone', label: 'Атмосфера', levels: ['мрачная или напряжённая', 'смешанная', 'тёплая, добрая, светлая']},
        {key: 'arc', label: 'Развитие героев', levels: ['падение или трагедия', 'без заметного развития', 'рост, обретение, достижение цели']},
        {key: 'ending', label: 'Финал', levels: ['трагический или безысходный', 'горько-сладкий', 'благоприятный и обнадёживающий']}
    ],
    notEnough: [
        'жанр «комедия» сам по себе',
        'чёрный юмор',
        'семейный фильм с тяжёлой драмой в центре'
    ],
    exclusions: ['тяжёлая трагедия, безысходность, насилие в центре сюжета'],
    insufficient: 'По досье нельзя понять тон и финал — insufficient.',
    passScore: 5,
    borderlineScore: 3
}

const ADULT_ANIMATION: Rubric = {
    version: 1,
    goal: 'Анимация, изначально рассчитанная на взрослую аудиторию (позиционирование, возрастной рейтинг, темы и подача для взрослых), а не семейная анимация со сложными темами.',
    criteria: [
        {key: 'audience', label: 'Целевая аудитория', levels: ['дети или семья', 'подростки и взрослые', 'явно взрослые: так позиционируется и описывается']},
        {key: 'content', label: 'Содержание', levels: ['детское', 'сложные темы в семейной подаче', 'взрослые темы, насилие, сатира, откровенность']},
        {key: 'evidence', label: 'Подтверждение в источнике', levels: ['нет', 'косвенное (рейтинг, ключевое слово)', 'прямое: «для взрослых», adult animation, взрослый возрастной рейтинг']}
    ],
    notEnough: [
        'семейный мультфильм о смерти, войне или одиночестве',
        'японская категория seinen сама по себе',
        'сложный сюжет без взрослого позиционирования'
    ],
    exclusions: ['мультфильм студии для семейного проката (Pixar, DreamWorks, Disney) без взрослого рейтинга'],
    insufficient: 'В досье нет признаков аудитории — insufficient.',
    passScore: 5,
    borderlineScore: 3
}

/* ------------------------------------- Справочник ------------------------------------- */

export const BUNDLES: Bundle[] = [
    // --- По сюжету (auto) ---
    {
        key: 'survival', title: 'Выбраться сможет не каждый', lead: 'Борьба за жизнь в экстремальных условиях.', emoji: '🏔',
        kind: 'auto', shelves: ['movie', 'series', 'anime_series'], ranking: 'relevance', minResults: 6,
        criteria: {concepts: [[10349, 3593, 9743, 155746, 336497, 179578, 353736]], boost: [3593, 9743, 155746, 179578]}
    },
    {
        key: 'whodunit', title: 'Кто убийца?', lead: 'Расследование и круг подозреваемых до последней сцены.', emoji: '🕵️',
        kind: 'auto', shelves: LIVE, ranking: 'relevance', minResults: 6,
        criteria: {concepts: [[207046, 12570, 364800]], genres: {movie: {anyOf: [9648, 80]}, tv: {anyOf: [9648, 80]}}}
    },
    {
        key: 'time_loop', title: 'Петля времени', lead: 'Один и тот же день, параллельные миры и парадоксы.', emoji: '🔁',
        kind: 'auto', shelves: ['movie', 'series', 'anime_series', 'animated_movie'], ranking: 'relevance', minResults: 6,
        // «alternative reality» и «multiverse» тянули «Мстителей» и «Человека-паука» — не берём.
        criteria: {concepts: [[10854, 243230, 186760]], boost: [10854]}
    },
    {
        key: 'trapped', title: 'Заперты', lead: 'Одно место, выхода нет.', emoji: '🚪',
        kind: 'auto', shelves: LIVE, ranking: 'relevance', minResults: 6,
        criteria: {concepts: [[18029, 2321, 2147, 191586, 240252, 185477, 368386]], boost: [368386, 240252]}
    },
    {
        key: 'death_game', title: 'Игры на выживание', lead: 'Смертельные игры, где проигравший не уходит.', emoji: '🎲',
        kind: 'auto', shelves: ['movie', 'anime_series'], ranking: 'relevance', minResults: 6,
        criteria: {concepts: [[295702, 285633, 220572]]}
    },
    {
        key: 'antihero', title: 'Злодей интереснее героя', lead: 'Антигерои, за которыми невозможно не следить.', emoji: '😈',
        kind: 'auto', shelves: ['movie', 'series', 'anime_series'], ranking: 'relevance', minResults: 6,
        // «villain» не берём: он есть почти у каждого мультфильма Disney.
        criteria: {concepts: [[2095, 11426]]}
    },
    {
        key: 'reality', title: 'Где реальность?', lead: 'Галлюцинации, игры разума и ненадёжный рассказчик.', emoji: '🌀',
        kind: 'auto', shelves: LIVE, ranking: 'relevance', minResults: 6,
        criteria: {concepts: [[3298, 184312, 187008, 174089, 306194, 3972, 186789, 226106]], boost: [174089, 3972, 187008]}
    },
    {
        key: 'con', title: 'Самые хитрые аферы', lead: 'Обман, двойная игра и мошенники.', emoji: '🃏',
        kind: 'auto', shelves: LIVE, ranking: 'relevance', minResults: 6,
        criteria: {concepts: [[10453, 33456, 9758, 301541]], boost: [10453, 33456]}
    },
    {
        key: 'epidemic', title: 'Смертельные эпидемии', lead: 'Вирус вырвался наружу.', emoji: '🦠',
        kind: 'auto', shelves: LIVE, ranking: 'relevance', minResults: 6,
        criteria: {concepts: [[188973, 17995]], exclude: [262235]}
    },
    {
        key: 'world_end', title: 'Когда мир рухнул', lead: 'Конец света и жизнь после него.', emoji: '🌋',
        kind: 'auto', shelves: ['movie', 'series', 'anime_series'], ranking: 'relevance', minResults: 6,
        // «disaster» тянул «Титаник» — не берём.
        criteria: {concepts: [[10150, 4458, 359337]]}
    },
    {
        key: 'machines', title: 'Машины умнее нас', lead: 'Искусственный интеллект и роботы, вышедшие из-под контроля.', emoji: '🤖',
        kind: 'auto', shelves: ['movie', 'series', 'anime_series'], ranking: 'relevance', minResults: 6,
        criteria: {concepts: [[310, 14544, 803, 1373]], boost: [310]}
    },
    {
        key: 'virtual', title: 'Внутри виртуального мира', lead: 'Игры, симуляции и цифровые миры.', emoji: '🕶',
        kind: 'auto', shelves: ['movie', 'anime_series'], ranking: 'relevance', minResults: 6,
        criteria: {concepts: [[4563, 3972]]}
    },
    {
        key: 'rise', title: 'С нуля до вершины', lead: 'Амбиции, деньги и цена успеха.', emoji: '📈',
        kind: 'auto', shelves: LIVE, ranking: 'relevance', minResults: 6,
        criteria: {concepts: [[5626, 171068, 165725, 3734]], boost: [5626, 165725]}
    },
    {
        key: 'dark_fantasy', title: 'Тёмное фэнтези', lead: 'Мрачные миры, магия и монстры.', emoji: '🗡',
        kind: 'auto', shelves: ['movie', 'series', 'anime_series', 'anime_movie', 'animated_series'], ranking: 'relevance', minResults: 6,
        criteria: {concepts: [[177895]]}
    },
    {
        key: 'isekai', title: 'Исекай', lead: 'Попаданцы в другой мир.', emoji: '🌌',
        kind: 'auto', shelves: ['anime_series', 'donghua_series'], ranking: 'popular', minResults: 6,
        criteria: {concepts: [[237451, 227624, 213756, 291482]]}
    },
    {
        key: 'mecha', title: 'Меха', lead: 'Гигантские роботы и пилоты.', emoji: '🦾',
        kind: 'auto', shelves: ['anime_series', 'anime_movie', 'animated_series'], ranking: 'popular', minResults: 6,
        criteria: {concepts: [[10046, 10891]]}
    },
    {
        key: 'school_life', title: 'Школьная жизнь', lead: 'Школа, друзья и первая любовь.', emoji: '🏫',
        kind: 'auto', shelves: ['anime_series'], ranking: 'popular', minResults: 6,
        criteria: {concepts: [[190116, 317537, 238675]]}
    },

    // --- По свойствам (auto) ---
    {
        key: 'weekend', title: 'Посмотреть за выходные', lead: 'Завершённые мини-сериалы — до 10 серий.', emoji: '🛋',
        // У дунхуа мини-сериалов нет (аудит 19.11: 0).
        kind: 'auto', shelves: ['series', 'animated_series', 'anime_series'], sections: ['series_completed'], ranking: 'weighted', minResults: 6,
        criteria: {props: {tvType: 'miniseries', status: ['Ended', 'Canceled'], episodes: {max: 10}}}
    },
    {
        key: 'one_evening', title: 'Кино на один вечер', lead: 'Без затяжки: 70–100 минут.', emoji: '🌙',
        kind: 'auto', shelves: MOVIE_SHELVES, sections: ['movies'], ranking: 'weighted', minResults: 6,
        criteria: {props: {runtime: {min: 70, max: 100}, rating: {min: 6.8}}}
    },
    {
        key: 'underrated', title: 'Недооценённые', lead: 'Высокие оценки, но мало кто видел.', emoji: '💎',
        kind: 'auto', shelves: ALL, ranking: 'weighted', minResults: 6,
        criteria: {props: {rating: {min: 7.3}, votes: {min: 1, max: 10}}}
    },
    {
        key: 'classics', title: 'Классика', lead: 'Проверено временем: до 2000 года.', emoji: '🎞',
        // Аудит 19.11: у дунхуа классики нет, у живых сериалов с 1985 года — 5 (мало).
        kind: 'auto', shelves: ['movie', 'animated_movie', 'anime_movie', 'animated_series', 'anime_series'], sections: ['movies', 'series_completed'], ranking: 'weighted', minResults: 6,
        criteria: {props: {released: {to: '2000-12-31'}, rating: {min: 7.5}}}
    },
    {
        key: 'horror_comedy', title: 'Страшно смешно', lead: 'Ужасы и комедия в одном фильме.', emoji: '🎃',
        kind: 'auto', shelves: ['movie'], ranking: 'weighted', minResults: 6,
        criteria: {genres: {movie: {allOf: [27, 35]}}}
    },
    {
        key: 'crime_comedy', title: 'Криминальная комедия', lead: 'Бандиты, деньги и много смеха.', emoji: '💰',
        kind: 'auto', shelves: LIVE, ranking: 'weighted', minResults: 6,
        criteria: {genres: {movie: {allOf: [80, 35]}, tv: {allOf: [80, 35]}}}
    },

    // --- Судимые (judged): TMDB находит кандидатов, судья подтверждает ---
    {
        key: 'twist', title: 'Ты не угадаешь финал', lead: 'Поворот в конце, после которого хочется пересмотреть.', emoji: '🤯',
        kind: 'judged', shelves: LIVE, ranking: 'relevance', minResults: 6, rubric: TWIST,
        criteria: {
            concepts: [[326438, 275311, 335567, 331114, 174089, 12565, 3298, 184312]],
            genres: {movie: {anyOf: [53, 9648, 80, 878]}, tv: {anyOf: [9648, 80, 10765]}}
        },
        anchors: [m(745), m(11324), m(1124), m(550), m(629), m(210577), m(77), m(670), m(1933), m(1592)],
        controls: {positive: [m(745), m(11324), m(629), m(1933)], negative: [m(155), m(597), m(13), m(120)]}
    },
    {
        key: 'sad_end', title: 'Без хэппи-энда', lead: 'Истории, которые заканчиваются совсем не так, как хочется.', emoji: '🥀',
        kind: 'judged', shelves: LIVE, ranking: 'relevance', minResults: 6, rubric: SAD_END,
        criteria: {concepts: [[10614, 368391, 230747, 9872, 697, 6564, 160234]], genres: {movie: {anyOf: [18]}, tv: {anyOf: [18]}}},
        anchors: [m(641), m(807), m(5876), m(70), m(142), m(14574), m(334541)],
        controls: {positive: [m(641), m(5876), m(70), m(14574)], negative: [m(278), m(10193), m(13), m(77338)]}
    },
    {
        key: 'tearjerker', title: 'Не смотри без платка', lead: 'Истории о потере, любви и прощании.', emoji: '😢',
        kind: 'judged', shelves: ['movie', 'series', 'animated_movie', 'anime_movie'], ranking: 'relevance', minResults: 6, rubric: TEARJERKER,
        criteria: {concepts: [[156924, 6564, 9872, 160234, 697, 10614]]},
        anchors: [m(28178), m(497), m(354912), m(14160), m(222935), m(258230), m(637), m(424)],
        controls: {positive: [m(28178), m(497), m(222935), m(258230)], negative: [m(293660), m(76341), m(155), m(120)]}
    },
    {
        key: 'feelgood', title: 'Поднять настроение', lead: 'Тёплые истории, после которых становится лучше.', emoji: '☀️',
        kind: 'judged', shelves: ['movie', 'series', 'animated_movie', 'animated_series'], ranking: 'relevance', minResults: 6, rubric: FEELGOOD,
        criteria: {
            concepts: [[275276, 194088, 319357, 326774, 6054]],
            genres: {movie: {anyOf: [35, 10751, 10749]}, tv: {anyOf: [35, 10751]}},
            props: {rating: {min: 6.8}}
        },
        anchors: [m(346648), m(77338), m(194), m(13), m(116745), m(212778), m(773), m(2062)],
        controls: {positive: [m(346648), m(77338), m(194), m(212778)], negative: [m(641), m(807), m(5876), m(424)]}
    },
    {
        key: 'adult_animation', title: 'Мульты не для детей', lead: 'Анимация, которую снимали для взрослых.', emoji: '🔞',
        kind: 'judged', shelves: ['animated_movie', 'animated_series', 'anime_movie', 'anime_series'], ranking: 'popular', minResults: 6, rubric: ADULT_ANIMATION,
        criteria: {concepts: [[161919, 10123]]},
        anchors: [tv(61222), tv(60625), m(291270), m(10494)],
        controls: {positive: [tv(61222), tv(60625), m(291270)], negative: [m(354912), m(14160), m(150540), m(2062)]}
    }
]

export const bundleByKey = (key: string | undefined): Bundle | undefined => BUNDLES.find(bundle => bundle.key === key)

/** Разделы связки: у судимых — только завершённое (финал известен и описан в источниках). */
export const bundleSections = (bundle: Bundle): SectionKey[] =>
    bundle.sections ?? (bundle.kind === 'judged' ? ['movies', 'series_completed'] : BUNDLE_SECTIONS)

/** Применима ли связка на полке в разделе. */
export const bundleFits = (bundle: Bundle, shelf: ShelfKey, section: SectionKey) =>
    bundle.shelves.includes(shelf) && bundleSections(bundle).includes(section)

/** Связки, доступные на полке в разделе. */
export const bundlesFor = (shelf: ShelfKey, section: SectionKey): Bundle[] =>
    BUNDLES.filter(bundle => bundleFits(bundle, shelf, section))

/**
 * Рубрика для суда: у судимых своя, у автоматических — общая по обещанию связки (судья проверяет,
 * что тайтл действительно про это, и «нет» убирает шум ключевых слов TMDB).
 */
export const rubricOf = (bundle: Bundle): Rubric => bundle.rubric ?? {
    version: 1,
    goal: `Подборка «${bundle.title}»: ${bundle.lead} Тайтл подходит, если это заметная, центральная часть его сюжета или сути, а не эпизод.`,
    criteria: [
        {key: 'central', label: 'Тема в центре', levels: ['темы нет', 'тема есть, но второстепенна', 'тема — основа сюжета или сути']},
        {key: 'promise', label: 'Соответствие обещанию подборки', levels: ['зритель будет разочарован', 'отчасти соответствует', 'ровно то, что обещает подборка']},
        {key: 'evidence', label: 'Подтверждение в источнике', levels: ['в досье нет', 'косвенно', 'прямо описано в досье']}
    ],
    notEnough: ['одна сцена или побочная линия на эту тему', 'ключевое слово TMDB без подтверждения в описании'],
    exclusions: [],
    insufficient: 'Описание слишком краткое, чтобы понять, о чём тайтл, — insufficient.',
    passScore: 4,
    borderlineScore: 3
}

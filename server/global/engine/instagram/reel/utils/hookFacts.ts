/**
 * Проверенные факты о фильме для хука в редакционном стиле («Номинированный на «Эмми» сериал
 * возвращается»). Собирает их сервер при создании задачи (jobs/collectHookFacts.ts: TMDB и
 * Wikidata), модель только выбирает из них. Здесь — формат, текст для промпта и проверка
 * вариантов: хук с наградой, сезоном или франшизой, которых нет в фактах, отбрасывается.
 */

export const HOOK_AWARDS = ['Оскар', 'Эмми', 'Золотой глобус', 'BAFTA', 'Каннский фестиваль'] as const
export type HookAward = typeof HOOK_AWARDS[number]

export type HookFacts = {
    /** До двух главных актёров по порядку в титрах. */
    cast: string[]
    /** Режиссёр фильма или создатели сериала. */
    creators: string[]
    /** Фильм входит в серию (TMDB collection). */
    franchise?: string
    /** Сериал: номер последнего сезона; returning — сезон новый (выходит или вышел недавно). */
    season?: {number: number, returning: boolean}
    /** Награды самого фильма или сериала (Wikidata P166 / P1411), не актёров. */
    awards: Array<{award: HookAward, won: boolean, category?: string, year?: number}>
}

const awardLine = ({award, won, category, year}: HookFacts['awards'][number]) =>
    `${won ? 'Получил' : 'Номинирован'}: ${category || `«${award}»`}${year ? `, ${year}` : ''}`

/** Факты строками для промпта; пустой список — фактов нет. */
export const hookFactLines = (facts?: HookFacts): string[] => {
    if (!facts) return []
    return [
        ...(facts.cast.length ? [`В главных ролях: ${facts.cast.join(', ')}`] : []),
        ...(facts.creators.length ? [`Режиссёр или создатели: ${facts.creators.join(', ')}`] : []),
        ...(facts.franchise ? [`Часть серии фильмов «${facts.franchise}»`] : []),
        ...(facts.season ? [facts.season.returning
            ? `Сериал возвращается: ${facts.season.number}-й сезон`
            : `Сериал, сезонов: ${facts.season.number} (нового сезона нет)`] : []),
        ...facts.awards.slice(0, 6).map(awardLine)
    ]
}

const word = (stems: string) => new RegExp(`(?<![а-яёa-z])(?:${stems})`, 'iu')

const AWARD_PATTERNS: Record<HookAward, RegExp> = {
    'Оскар': word('оскар'),
    'Эмми': word('эмми|emmy'),
    'Золотой глобус': word('глобус'),
    'BAFTA': word('bafta|бафта'),
    'Каннский фестиваль': word('канн|пальмов')
}

const NOMINATION = word('номин')
const RETURNING = word('возвращ|вернул|нов\\S{0,3} сезон|сезон')
const SEQUEL = word('продолжени|сиквел|франшиз|снова в деле')
// «Хит» нечем подтвердить: у TMDB нет данных о просмотрах, рейтинг — не популярность.
const HIT = /(?<![а-яё])хит(?:а|у|ом|ы|ов)?(?![а-яё])/iu
const ANY_AWARD = word('преми|наград|лауреат|оскар|эмми|глобус|bafta|бафта|канн|пальмов')

/**
 * Почему вариант нельзя показывать: утверждение, которого нет в фактах. Пустой список —
 * вариант честный. Имена и сюжет не проверяются (их проверяет администратор на шаге хука).
 */
export const unsupportedClaims = (hook: string, facts?: HookFacts): string[] => {
    const problems: string[] = []
    const awards = facts?.awards ?? []

    if (HIT.test(hook)) problems.push('«хит» без данных о просмотрах')

    let namedAward = false
    for (const award of HOOK_AWARDS) {
        if (!AWARD_PATTERNS[award].test(hook)) continue
        namedAward = true
        const known = awards.filter(item => item.award === award)
        // «Номинирован» подтверждает и номинация, и победа; без этого слова хук говорит о победе.
        if (!known.length || (!NOMINATION.test(hook) && !known.some(item => item.won))) {
            problems.push(`нет факта о «${award}»`)
        }
    }
    if (!namedAward && ANY_AWARD.test(hook) && !awards.length) problems.push('награда без факта')

    if (RETURNING.test(hook) && !facts?.season?.returning) problems.push('нет нового сезона')
    if (SEQUEL.test(hook) && !facts?.franchise && !facts?.season) problems.push('нет серии фильмов')

    return problems
}

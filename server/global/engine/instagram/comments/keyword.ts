/**
 * Ключевое слово в комментарии под Reel. Совпадение — слово целиком, в любом месте комментария,
 * без учёта регистра, «ё» и знаков: «Сохранить», «сохранить!», «Хочу СОХРАНИТЬ 🔥» — да;
 * «сохранила», «сохранится», «пересохранить» — нет. Отрицание не разбираем: «не сохранить» — да.
 */
export const DEFAULT_KEYWORDS = ['сохранить'] as const

export const normalizeComment = (text: string | null | undefined): string[] =>
    String(text ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)

export const matchesKeyword = (text: string | null | undefined, keywords: readonly string[] = DEFAULT_KEYWORDS): boolean => {
    const words = new Set(normalizeComment(text))
    return keywords.some(keyword => normalizeComment(keyword).every(word => words.has(word)) && normalizeComment(keyword).length > 0)
}

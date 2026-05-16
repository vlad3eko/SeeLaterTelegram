export const FormatRating = (rating: number, fractionDigits: number = 1) => {
    return String(rating).length > fractionDigits ? rating.toFixed(fractionDigits) : rating
}

export const FormatDate = (date: string | number | undefined) => {
    return date ? Number((String(date)).slice(0, 4)) : ''
}

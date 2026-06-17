export const dateConvert = (date: string): string => {
    return date?.split('-')
        .reverse()
        .join('.')
}

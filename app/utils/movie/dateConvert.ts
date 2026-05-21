export const dateConvert = (date: string) => {
    return date?.split('-')
        .reverse()
        .join('.')
}

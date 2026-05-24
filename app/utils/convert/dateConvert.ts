export const dateConvert = (date: string | undefined) => {
    return date?.split('-')
        .reverse()
        .join('.')
}

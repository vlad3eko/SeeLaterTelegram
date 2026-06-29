export const dateIsoConvert = (date: string | undefined) => {
    if (!date) return null

    return new Date(date)
        .toLocaleDateString('ru-RU')
}

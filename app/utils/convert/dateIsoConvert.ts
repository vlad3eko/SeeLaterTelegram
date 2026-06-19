export const dateIsoConvert = (date: string) => {
    return new Date(date)
        .toLocaleDateString('ru-RU')
}

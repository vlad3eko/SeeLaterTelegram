export const formatMediaOverview = (
    overview?: string,
    maxLength = 350,
    addOverview?: string
) => {

    if (!overview)
        return 'Описание отсутствует'

    if (addOverview)
        return addOverview


    if (overview.length <= maxLength)
        return overview


    const cropped =
        overview.slice(0, maxLength)


    const lastDot =
        cropped.lastIndexOf('.')


    if (lastDot === -1)
        return cropped


    return cropped.slice(0, lastDot + 1)
}

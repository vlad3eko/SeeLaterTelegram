import {linkOfMedia} from "#server/global/helpers/linkOfMedia";

export const formatPersonBiography = (text: string): string => {
    if (!text) return ''

    // Разбиваем текст на отдельные награды по запятой
    const awards = text.split(',').map(item => item.trim())

    // Обрабатываем каждую награду
    const formattedAwards = awards.map(award => {
        // Ищем название в скобках [Название]
        const match = award.match(/\[([^\]]+)\]/)
        const title = match ? match[1] : '' // Название без скобок

        // Убираем [Название] из текста
        const cleanAward = award.replace(/\[[^\]]+\]/, '').trim()

        // Если есть название — добавляем ссылку
        if (title) {
            return `<i>${cleanAward}</i> \n${linkOfMedia(title, cleanAward)}`
        }

        return cleanAward
    })

    // Собираем обратно
    return `${formattedAwards.join('\n')}`
}

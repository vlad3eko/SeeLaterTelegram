const departmentsRegistry: Record<string, string> = {
    'Acting': 'Актёр',
    'Directing': 'Режиссёр',
    'Producer': 'Продюсер',
    'Writing': 'Сценарист',
    'Executive Producer': 'Исполнительный продюсер',
    'Visual Effects': 'Визуальные эффекты',
    'Editing': 'Монтаж',
    'Camera': 'Оператор',
    'Cinematography': 'Оператор',
    'Sound': 'Звук',
    'Production Design': 'Художник-постановщик',
    'Art': 'Художник',
    'Costume & Make-Up': 'Костюмер',
    'Costume': 'Костюмер',
    'Crew': 'Съёмочная группа',
    'Lighting': 'Осветитель',
    'Creator': 'Создатель',
    'Animation': 'Анимация',
}

export const convertTranslateKnowForDepartment = (person: string): string => {
    return departmentsRegistry[person] || ''
}

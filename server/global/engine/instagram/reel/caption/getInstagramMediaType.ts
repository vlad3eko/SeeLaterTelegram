import {ContentType} from "#server/global/engine/search/strategy/enums"
import {contentTypeConvert} from "~/utils/convert/contentTypeConvert";

const HOOK_TEMPLATES: Record<string, string[]> = {
    фильм: [
        'ФИЛЬМ КОТОРЫЙ НЕЛЬЗЯ ПРОПУСТИТЬ',
        'ФИЛЬМ КОТОРЫЙ СТОИТ ПОСМОТРЕТЬ',
        'ФИЛЬМ КОТОРЫЙ ВАС УДИВИТ',
        'ФИЛЬМ КОТОРЫЙ ЗАСЛУЖИВАЕТ ВАШЕГО ВНИМАНИЯ',
        'ФИЛЬМ КОТОРЫЙ СТОИТ ДОБАВИТЬ В СПИСОК',
        'ФИЛЬМ КОТОРЫЙ ВЫ ТОЧНО ЗАПОМНИТЕ',
        'ФИЛЬМ КОТОРЫЙ ХОЧЕТСЯ ПОСМОТРЕТЬ СРАЗУ',
        'ФИЛЬМ КОТОРЫЙ МОЖЕТ СТАТЬ ВАШИМ ЛЮБИМЫМ',
        'ФИЛЬМ КОТОРЫЙ ДОЛГО НЕ ОТПУСКАЕТ',
        'ФИЛЬМ КОТОРЫЙ НЕ ДАСТ СКУЧАТЬ',
        'ФИЛЬМ КОТОРЫЙ СТОИТ УВИДЕТЬ ХОТЯ БЫ РАЗ'
    ],

    сериал: [
        'СЕРИАЛ КОТОРЫЙ НЕЛЬЗЯ ПРОПУСТИТЬ',
        'СЕРИАЛ КОТОРЫЙ СТОИТ НАЧАТЬ',
        'СЕРИАЛ КОТОРЫЙ ЗАТЯГИВАЕТ С ПЕРВОЙ СЕРИИ',
        'СЕРИАЛ КОТОРЫЙ ВАС УДИВИТ',
        'СЕРИАЛ КОТОРЫЙ СТОИТ ДОБАВИТЬ В СПИСОК',
        'СЕРИАЛ КОТОРЫЙ ХОЧЕТСЯ ПОСМОТРЕТЬ ЗА ОДИН ВЕЧЕР',
        'СЕРИАЛ ОТ КОТОРОГО СЛОЖНО ОТОРВАТЬСЯ',
        'СЕРИАЛ КОТОРЫЙ МОЖЕТ СТАТЬ ВАШИМ НОВЫМ ФАВОРИТОМ',
        'СЕРИАЛ КОТОРЫЙ ТОЧНО СТОИТ ДОБАВИТЬ В СПИСОК'
    ],

    мультфильм: [
        'МУЛЬТФИЛЬМ КОТОРЫЙ НЕЛЬЗЯ ПРОПУСТИТЬ',
        'МУЛЬТФИЛЬМ КОТОРЫЙ СТОИТ ПОСМОТРЕТЬ',
        'МУЛЬТФИЛЬМ КОТОРЫЙ УДИВИТ НЕ ТОЛЬКО ДЕТЕЙ',
        'МУЛЬТФИЛЬМ КОТОРЫЙ СТОИТ ДОБАВИТЬ В СПИСОК',
        'МУЛЬТФИЛЬМ КОТОРЫЙ ВЫ ЗАПОМНИТЕ НАДОЛГО',
        'МУЛЬТФИЛЬМ КОТОРЫЙ ХОЧЕТСЯ ПОСМОТРЕТЬ СНОВА',
        'МУЛЬТФИЛЬМ КОТОРЫЙ МОЖЕТ ВАС УДИВИТЬ',
        'МУЛЬТФИЛЬМ КОТОРЫЙ ПОДОЙДЁТ ДЛЯ ВЕЧЕРНЕГО ПРОСМОТРА'
    ],

    мультсериал: [
        'МУЛЬТСЕРИАЛ КОТОРЫЙ НЕЛЬЗЯ ПРОПУСТИТЬ',
        'МУЛЬТСЕРИАЛ КОТОРЫЙ СТОИТ НАЧАТЬ',
        'МУЛЬТСЕРИАЛ КОТОРЫЙ ЗАТЯГИВАЕТ С ПЕРВОЙ СЕРИИ',
        'МУЛЬТСЕРИАЛ КОТОРЫЙ МОЖЕТ ВАС УДИВИТЬ',
        'МУЛЬТСЕРИАЛ КОТОРЫЙ СТОИТ ДОБАВИТЬ В СПИСОК',
        'МУЛЬТСЕРИАЛ КОТОРЫЙ ХОЧЕТСЯ ПОСМОТРЕТЬ СНОВА',
        'МУЛЬТСЕРИАЛ КОТОРЫЙ НЕ ДАСТ СКУЧАТЬ'
    ],

    аниме: [
        'АНИМЕ КОТОРОЕ НЕЛЬЗЯ ПРОПУСТИТЬ',
        'АНИМЕ КОТОРОЕ СТОИТ ПОСМОТРЕТЬ',
        'АНИМЕ КОТОРОЕ ЗАТЯГИВАЕТ С ПЕРВОЙ СЕРИИ',
        'АНИМЕ КОТОРОЕ МОЖЕТ ВАС УДИВИТЬ',
        'АНИМЕ КОТОРОЕ СТОИТ ДОБАВИТЬ В СПИСОК',
        'АНИМЕ КОТОРОЕ ВЫ ЗАПОМНИТЕ НАДОЛГО',
        'АНИМЕ ОТ КОТОРОГО СЛОЖНО ОТОРВАТЬСЯ'
    ]
};

export const createInstagramHook = (
    mediaType: string,
    contentType: ContentType
): string => {
    const convertedType = String(
        contentTypeConvert(mediaType, contentType) ?? ''
    )
        .trim()
        .toLocaleLowerCase('ru-RU')

    const aliases: Record<string, string> = {
        film: 'фильм',
        movie: 'фильм',
        фильм: 'фильм',

        tv: 'сериал',
        series: 'сериал',
        miniseries: 'сериал',
        сериал: 'сериал',

        cartoon: 'мультфильм',
        animation: 'мультфильм',
        мультфильм: 'мультфильм',

        'animated series': 'мультсериал',
        мультсериал: 'мультсериал',

        anime: 'аниме',
        аниме: 'аниме',
    }

    // Сначала учитываем результат конвертации, чтобы сохранить
    // различия между сериалами, мультсериалами и аниме.
    let type = HOOK_TEMPLATES[convertedType]
        ? convertedType
        : aliases[convertedType]

    // Если конвертер вернул неизвестное значение,
    // используем хотя бы тип TMDB movie/tv.
    if (!type) {
        const normalizedMediaType = String(mediaType)
            .trim()
            .toLowerCase()

        if (['movie', 'film'].includes(normalizedMediaType)) {
            type = 'фильм'
        } else if (
            ['tv', 'series', 'miniseries'].includes(normalizedMediaType)
        ) {
            type = 'сериал'
        }
    }

    const hooks = type
        ? HOOK_TEMPLATES[type]
        : undefined

    if (!hooks?.length) {
        console.error('[INSTAGRAM HOOK TYPE NOT FOUND]', {
            mediaType,
            contentType,
            convertedType,
            resolvedType: type ?? null,
        })

        return ''
    }

    const selectedHook = hooks[
        Math.floor(Math.random() * hooks.length)
        ]!

    // Удаляем огонь ещё до передачи строки в декоратор.
    const hook = selectedHook
        .replace(/🔥+/gu, ' ')
        .replace(/[\uFE0F\u200D]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()

    console.log('[INSTAGRAM HOOK RESOLVED]', {
        mediaType,
        contentType,
        convertedType,
        resolvedType: type,
        hook,
    })

    return hook
}

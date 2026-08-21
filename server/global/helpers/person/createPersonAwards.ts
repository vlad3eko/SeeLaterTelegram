import {personSocials} from "#server/global/helpers/person/socialMedia";
import {linkOfMedia} from "#server/global/helpers/linkOfMedia";
import {convertProfession} from "#server/global/helpers/person/convertProfession";
import {getPersonAge} from "#server/global/helpers/person/getPersonAge";
import {filterTheMovie} from "~/utils/media/filterTheMovie";
import {sortByRating} from "~/utils/media/sortByRating";

export const createPersonAwards = (media: any, person: any) => {
    const name = media.name || 'Неизвестный человек'

    const profession = convertProfession(media)

    const birthday = media.birthday
        ? getPersonAge(media.birthday)
        : ''

    const personTmdbId = media.id

    const placeOfBirth =
        media.place_of_birth || ''

    /*
     * =========================
     * ЛУЧШИЕ ФИЛЬМЫ / РОЛИ
     * =========================
     */

    const cast = (media.combined_credits?.cast || [])
        .filter(filterTheMovie)
        .filter((movie: any) => movie.character)
        .sort(sortByRating)

    /*
     * =========================
     * ОСНОВНАЯ ИНФОРМАЦИЯ / ДАТА / МЕСТО
     * =========================
     */

    const preview = [
        `<b>${name}</b>`,
        '',
        `tmdb: <code>${personTmdbId}</code>`,
        `${profession}`,
    ].join('\n')

    let location = ''

    if (placeOfBirth) {

        /*
         * TMDB обычно возвращает:
         *
         * Kingston upon Thames, London, England, UK
         *
         * Здесь пока просто показываем
         * оригинальное значение.
         */

        location = `📍 ${placeOfBirth}`
    }

    const header = [
        preview,
        birthday ? `🎂 ${birthday}` : '',
        location
    ]
        .filter(Boolean)
        .join('\n')

    /*
     * =========================
     * ФАКТ
     * =========================
     */

    const factBlock = person.fact
        ? [
            `—  <b>Факт из жизни:</b>`,
            `<blockquote>${person.fact}</blockquote>`
        ].join('\n')
        : ''

    /*
     * =========================
     * ДОСТИЖЕНИЯ
     * =========================
     */

    const awardBlock = person.awards
        ? [
            `—  <b>Достижения:</b>`,
            person.awards
        ].join('\n')
        : ''

    /*
 * =========================
 * Обязательно посмотрите
 * =========================
 */

    const knownFor = [...cast]
        .sort(
            (a: any, b: any) =>
                (b.popularity || 0) -
                (a.popularity || 0)
        )
        .slice(0, 3)

    const knownForBlock = knownFor.length
        ? [
            `<b>—  Обязательно посмотрите:</b>`,
            knownFor
                .map((movie: any) => {
                    return linkOfMedia(movie.title || movie.name, media.name)
                })
                .join('\n')
        ].join('\n')
        :
        ''

    const socialBlock = personSocials(media.external_ids)

    /*
     * =========================
     * СОБИРАЕМ КАРТОЧКУ
     * =========================
     */

    return [
        header,

        factBlock,

        awardBlock,

        knownForBlock,

        socialBlock
    ]
        .filter(Boolean)
        .join('\n\n')
}

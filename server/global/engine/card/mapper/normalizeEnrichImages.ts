import {filterTheMovie} from "~/utils/media/filterTheMovie";
import {sortByRating} from "~/utils/media/sortByRating";
import {dateConvert} from "~/utils/convert/dateConvert";
import {dateIsoConvert} from "~/utils/convert/dateIsoConvert";
import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";
import type {typeRichCard} from "#server/global/engine/card/engineRichCard";

const normalizeMediaCredits = (data: any[]) =>
    data.map((dataItem: any) => ({
        id: dataItem.id,
        path: dataItem.profile_path,
        name: dataItem.name,
        role: convertTranslateKnowForDepartment(
            dataItem.known_for_department
        ),
    }))


const normalizePersonCredits = (data: any[]) =>
    data.filter(filterTheMovie).filter((movie: any) =>
        movie.character &&
        !movie.character.includes('voice')
    )
        .sort(sortByRating)
        .sort(
            (a: any, b: any) =>
                (b.popularity || 0) -
                (a.popularity || 0)
        )
        .slice(0, 6)
        .map((dataItem: any) => ({
            id: dataItem.id,
            path:
                dataItem.backdrop_path ||
                dataItem.poster_path,
            name:
                dataItem.name ||
                dataItem.title,
            role: dataItem.character,
            mediaType: dataItem.media_type,
            releaseDate:
                dateConvert(dataItem.release_date) ||
                dateIsoConvert(dataItem.first_air_date)
        }))

const normalizeTvCredits = (data: any[]) =>
    data.map((dataItem: any) => ({
        id: dataItem.id,
        path: dataItem.poster_path,
    }))

export const normalizeEnrichImages = (type: typeRichCard, data: any) => {

    const Datalist = data || []

    const strategies = {
        movie: normalizeMediaCredits,
        tv: normalizeTvCredits,
        person: normalizePersonCredits
    }

    return strategies[type](Datalist)
}

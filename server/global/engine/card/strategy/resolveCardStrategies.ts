
import {
    getEnrichMediaApi,
    getPersonApi
} from "#server/global/engine/search/repository/tmdbRepository";
import {getTelegramMediaImages} from "#server/global/engine/card/construct/getTelegramPosterFileId";
import {normalizeEnrichImages} from "#server/global/engine/card/mapper/normalizeEnrichImages";
import {createMediaCaption} from "#server/global/engine/card/variant/createMediaCaption";
import {convertTranslateKnowForDepartment} from "#server/global/helpers/person/convert/translateKnowForDepartment";
import {
    keyboardPerson,
    keyboardSendMediaCardInline
} from "#server/bot/consts/buttons/keyboardBot";
import {createTvCaption} from "#server/global/engine/card/variant/createTvCaption";
import type {queryCTX, queryRichCard} from "#server/global/engine/card/enum/types";
import {createPersonCaption} from "#server/global/engine/card/variant/createPersonCaption";

const mediaCardStrategy = {

    resolve: (query: queryRichCard) => getEnrichMediaApi(query.id, query.type),

    enrich: async (ctx: queryCTX | undefined, query: queryRichCard, data: any) => ({
        media: data,
        contentType: query.contentType,
        addComment: query.addComment,
        addOverview: query.addOverview,
        keyTrailer: query.keyTrailer || data.keyTrailer,
        mediaOverride: query.mediaOverride,

        images: await getTelegramMediaImages(
            ctx?.ctx,
            query.id,
            query.type,
            {
                poster: [
                    data.poster_path,
                    data.backdrop_path
                ],

                postersList:
                    normalizeEnrichImages(
                        query.type,
                        data.credits
                    )
            }
        ),

        genres: data.genres
    }),

    caption: (query: queryRichCard, data: any) =>
        createMediaCaption(query.status, data),

    keyboard: (
        ctx: queryCTX | undefined,
        query: queryRichCard,
        data: any
    ) =>
        keyboardSendMediaCardInline(
            query.id,
            query.type,
            query.contentType,
            data.genres,
            ctx?.isAdmin,
            'inline',
            0,
            data.keyTrailer
        )
}

const tvCardStrategy = {

    resolve: (query: queryRichCard) =>
        getEnrichMediaApi(query.id, query.type),

    enrich: async (ctx: queryCTX | undefined, query: queryRichCard, data: any) => ({
        media: data,
        contentType: query.contentType,
        addComment: query.addComment,
        addOverview: query.addOverview,
        keyTrailer: query.keyTrailer || data.keyTrailer,
        mediaOverride: query.mediaOverride,

        images: await getTelegramMediaImages(
            ctx?.ctx,
            query.id,
            query.type,
            {
                poster: [
                    data.poster_path,
                    data.backdrop_path
                ],

                postersList:
                    normalizeEnrichImages(
                        query.type,
                        data.seasons
                    )
            }
        ),

        genres: data.genres,
        seasons: data.seasons
    }),

    caption: (query: queryRichCard, data: any) =>
        createTvCaption(query.status, data),

    keyboard: (
        ctx: queryCTX | undefined,
        query: queryRichCard,
        data: any
    ) =>
        keyboardSendMediaCardInline(
            query.id,
            query.type,
            query.contentType,
            data.genres,
            ctx?.isAdmin,
            'inline',
            0,
            data.keyTrailer
        )
}

const personCardStrategy = {

    resolve: (query: queryRichCard) =>
        getPersonApi(query.id),

    enrich: async (
        ctx: queryCTX | undefined,
        query: queryRichCard,
        data: any
    ) => ({
        media: data,
        contentType: query.contentType,

        images: await getTelegramMediaImages(
            ctx?.ctx,
            query.id,
            query.type,
            {
                poster: [
                    data.profile_path
                ],

                postersList:
                    normalizeEnrichImages(
                        query.type,
                        data.combined_credits?.cast
                    )
            }
        ),

        firstJob:
            convertTranslateKnowForDepartment(
                data.known_for_department
            ),

        secondJob:
            convertTranslateKnowForDepartment(
                data.combined_credits?.crew?.[0]?.job
            )
                ? 'Другие работы'
                : ''
    }),

    caption: (query: queryRichCard, data: any) =>
        createPersonCaption(query.status, data),

    keyboard: (
        ctx: queryCTX | undefined,
        query: queryRichCard,
        data: any
    ) =>
        keyboardPerson(
            query.id,
            data.firstJob,
            data.secondJob
        )
}

export const resolveCardStrategies = {
    movie: mediaCardStrategy,
    tv: tvCardStrategy,
    person: personCardStrategy,
}


import type {TmdbMovieDetails, TmdbTrailer} from "~/types/tmdb.types";
import type {TmdbPersonMovieCrew} from "~/types/tmdb.person.types";
import {useMovieStore} from "~/stores/movies.store";
import {useUserStore} from "~/stores/user.store";
import {useAuthStore} from "~/stores/auth.store";
import {mapRoleByMovie} from "~/utils/person/role/mapRoleByMovie";
import {tmdbFetch} from "#server/utils/api/tmdbFetch";

export const useMovieDetails = () => {

    const movieStore = useMovieStore()

    const route = useRoute()
    const slug = route.params.slug
    const media = route.params.media

    const idMedia = computed(() => {
        return String(slug).split('-')[0]
    })

    const {data, pending} = useAsyncData<TmdbMovieDetails>(`${media}-${idMedia.value}`,
        () => tmdbFetch('/api/tmdb/media', {
            query: {
                id: idMedia.value,
                media
            }
        }))

    // /api/tmdb/credits (общий с ботом) принимает mediaType и personJob и отдаёт { results }
    const fetchCredits = (personJob: 'cast' | 'crew') =>
        tmdbFetch<{ results?: any[] }>('/api/tmdb/credits', {
            query: {
                id: idMedia.value,
                mediaType: media,
                personJob
            }
        }).then(res => res?.results || [])

    const {data: credits, pending: creditsPending} = useAsyncData<Pick<TmdbMovieDetails, 'cast' | 'crew'>>(`${media}-credits-${idMedia.value}`,
        async () => {
            const [cast, crew] = await Promise.all([fetchCredits('cast'), fetchCredits('crew')])
            return {cast, crew}
        })

    const crewData = computed(() => {
        return (credits?.value?.crew || []) as TmdbPersonMovieCrew[]
    })

    const trailer = computed(() => {

        return data.value?.trailers?.find(
            trailer =>
                trailer.site === 'YouTube'
                && trailer.type === 'Trailer'
        )
    })

    /*
     * Избранное: состояние общее для всех компонентов страницы (ключ по тайтлу),
     * статус читается в браузере (cookie сессии) и перечитывается после входа.
     */
    const userStore = useUserStore()
    const authStore = useAuthStore()

    const {data: favoriteStatus} = useAsyncData<{ auth: boolean, saved: boolean }>(
        `${media}-favorite-${idMedia.value}`,
        () => $fetch('/api/favorites/status', {
            query: {tmdb_id: idMedia.value, media_type: media}
        }),
        {server: false, watch: [() => userStore.data?.id]}
    )

    const isSaved = computed(() => !!favoriteStatus.value?.saved)
    const favoriteBusy = useState(`${media}-favorite-busy-${idMedia.value}`, () => false)
    const favoriteMessage = useState<string>(`${media}-favorite-msg-${idMedia.value}`, () => '')

    let messageTimer: ReturnType<typeof setTimeout> | undefined
    const flash = (text: string) => {
        favoriteMessage.value = text
        clearTimeout(messageTimer)
        messageTimer = setTimeout(() => favoriteMessage.value = '', 3000)
    }

    const handleAddMovie = async () => {

        if (!data.value || favoriteBusy.value) return

        if (!userStore.isAuth) {
            flash('Войдите через Telegram, чтобы сохранять')
            authStore.login()
            return
        }

        favoriteBusy.value = true

        try {
            if (isSaved.value) {
                await $fetch('/api/favorites/remove', {
                    method: 'POST',
                    body: {tmdb_id: data.value.id, media_type: media}
                })
                favoriteStatus.value = {auth: true, saved: false}
                flash('Убрано из сохранённых')
                return
            }

            const item: any = data.value
            const {error} = await movieStore.createMovie({
                tmdb_id: item.id,
                media_type: String(media),
                title: item.title || item.name,
                poster_path: item.poster_path || item.backdrop_path,
                vote_average: item.vote_average,
                vote_count: item.vote_count,
                release_date: item.release_date || item.first_air_date,
            }) || {error: 'no-user'}

            if (error) {
                flash('Не удалось сохранить, попробуйте ещё раз')
                return
            }

            favoriteStatus.value = {auth: true, saved: true}
            flash('Сохранено')
        } catch (error) {
            console.error('[FAVORITE TOGGLE ERROR]', error)
            flash('Не удалось выполнить, попробуйте ещё раз')
        } finally {
            favoriteBusy.value = false
        }
    }

    const castConverter = computed(() => {
        return credits.value?.cast?.filter(actor => actor.profile_path ? actor.order <= 50 : false)
    })

    const convertCrewSection = computed(() => {
        return mapRoleByMovie(crewData.value)
    })

    return {
        trailer,
        data,
        pending,
        creditsPending,
        credits,
        handleAddMovie,
        isSaved,
        favoriteBusy,
        favoriteMessage,
        castConverter,
        convertCrewSection,
    }
}

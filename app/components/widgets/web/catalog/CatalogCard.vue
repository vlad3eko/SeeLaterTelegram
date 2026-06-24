<template>
  <NuxtLink
      v-if="media"
      :to="formatLink"
      class="relative rounded-xl">

    <div class="relative h-[262px] flex flex-col">

      <NuxtImg :src="computedImagesSrc" class="h-full object-cover w-full"/>
      <div
          class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none"/>

      <!--  Info    -->
      <div
          @mouseenter="loadInfo"
          @mouseleave="showInfo = false"
          class="flex justify-center absolute inset-x-0 top-0">
        <span
            class="material-symbols-outlined absolute
            md-16 pb-1 px-3  rounded-b-xl
            bg-panel/50 hover:bg-panel opacity-30 text-center hover:opacity-100">
         info
        </span>

        <div v-if="showInfo && movieInfo"
             @mouseenter="loadInfo"
             @mouseleave="showInfo = false"
             class="absolute left-full top-0 z-50 w-72 rounded-xl bg-panel p-4 shadow-lg will-change-transform">
          <p class="font-bold">{{ movieInfo.title }}</p>

          <p class="mt-2 text-sm line-clamp-5">
            {{ movieInfo.overview }}
          </p>

          <p class="mt-2">
            {{ movieInfo.type }}
          </p>

          <p class="mt-1 text-xs opacity-70">
            {{ movieInfo.genres }}
          </p>
        </div>
      </div>

      <div>
        <div v-if="media.vote_count"
             class="ml-1 absolute top-3 left-0 bg-accent/80 text-accent-foreground px-3 py-1 rounded-full text-sm font-bold"
             :class="statusClass">
          {{ media.vote_count }}
        </div>
        <div
            v-if="rating"
            class="rating mr-1 right-0">
          💎 {{ formatRating }}
        </div>
      </div>
    </div>
    <div class="mt-auto text-accent-foreground text-center gap-4">
      <div class="text-sm flex flex-col">
        <span class="font-bold">
          {{ formatTitle }}
        </span>
        <p v-if="date"
           class=" text-info mt-1">
          {{ formatDate }}
        </p>
      </div>
    </div>
  </NuxtLink>
</template>

<script lang="ts" setup>

import {FormatRating, FormatDate} from "~/utils/formatMoviesData";
import type {TmdbMovieDetails, TmdbMovieProps} from "~/types/tmdb.types";
import {createSlug} from "~/utils/createSlug";

const props = defineProps<TmdbMovieProps>()

const movieInfo = ref<{
  title: string
  overview: string
  type: string
  genres: string
} | null>(null)


const showInfo = ref<boolean>(false)

const title = computed(() => {
  return 'title' in props.media
      ? props.media.title
      : props.media.name
})

const date = computed(() => {
  return 'release_date' in props.media
      ? props.media.release_date
      : props.media.first_air_date
})

const loadInfo = async () => {

  showInfo.value = true

  if (movieInfo.value) return

  const data = await $fetch<TmdbMovieDetails>('/api/tmdb/movie', {
    query: {
      id: props.media.id,
      media: props.media.media_type
    }
  })

  if (!data) return
  if (!data.genres) return

  movieInfo.value = {
    title: title.value,
    overview: props.media.overview,
    type:
        props.media.media_type === 'tv'
            ? 'Сериал'
            : 'Фильм',
    genres:
        data.genres
            .map(i => i.name)
            .join(', ')
  }
}
// TODO подстроить компонент под supabase bookmarks


const computedImagesSrc = computed(() => {

  const errorImage =
      '/assets/errorImageMovie/errorImage.jpg'

  if (props.mode === 'tmdb') {

    return props.media.poster_path
    || props.media.backdrop_path
        ? `https://image.tmdb.org/t/p/w600_and_h900_face/${
            props.media.poster_path ||
            props.media.backdrop_path
        }`
        : errorImage
  }

  return `https://image.tmdb.org/t/p/w600_and_h900_face/${
      props.media.poster_path}` || errorImage
})

const statusClass = computed<string>(() => {

  if (props.mode === 'tmdb') {
    return ''
  }

  switch (props.media.status) {

    case 'planned':
      return 'bg-button text-accent border border-button-border'

    case 'watching':
      return 'bg-primary text-primary-foreground'

    case 'watched':
      return 'bg-focus text-white'

    default:
      return 'bg-panel text-info'
  }
})

const rating = computed(() => {
  return props.media.vote_average ? props.media.vote_average : props.media.vote_count
})

const formatTitle = computed(() => {
  return title.value
})

const formatDate = computed(() => {

  return FormatDate(date.value)
})

const formatRating = computed(() => {
  return rating.value ? FormatRating(rating.value) : ''
})

const formatLink = computed(() => {

  const type = props.media.media_type
  const id = props.media.tmdb_id || props.media.id

  const slug = createSlug(id, title.value)

  return `/${type}/${slug}`
})

</script>

<style scoped>

</style>

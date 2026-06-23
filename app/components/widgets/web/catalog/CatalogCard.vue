<template>
  <NuxtLink
      v-if="media"
      :to="formatLink"
      class="relative rounded-xl">

    <div class="relative h-[262px]">

      <NuxtImg :src="computedImagesSrc" class="h-full object-cover w-full "/>
      <div
          class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"/>

      <div
          @mouseenter="loadInfo"
          @mouseleave="showInfo = false"
          class="absolute top-0 w-full flex justify-center">
        <span
            class="material-symbols-outlined absolute
            md-16 pb-1 px-3  rounded-b-xl
            bg-panel/50 hover:bg-panel opacity-30 text-center hover:opacity-100">
         info
        </span>

        <div v-if="showInfo && movieInfo"
             @mouseenter="loadInfo"
             @mouseleave="showInfo = false"
             class=" absolute left-full top-0 z-50 w-72 rounded-xl bg-panel p-4 shadow-lg">
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
      <div class="">
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
    <div
        class="absolute bottom-0 text-white left-1/2 -translate-x-1/2 text-center p-5 flex flex-col gap-4  w-full">
      <div class="text-sm">
        <span class="font-bold">
          {{ formatTitle }}
        </span>
        <p v-if="media.release_date"
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
import {dateIsoConvert} from "~/utils/convert/dateIsoConvert";
import {useMovieDetails} from "~/composables/movie/useMovieDetails";

const props = defineProps<TmdbMovieProps>()

const movieInfo = ref<{
  title: string
  overview: string
  type: string
  genres: string
} | null>(null)

const showInfo = ref<boolean>(false)

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
    title: props.media.title || props.media.name,
    overview: props.media.overview,
    type: props.media.media_type === 'tv' ? 'Сериал' : 'Фильм',
    genres: data.genres.map(i => i.name).join(', ')
  }
}
// TODO подстроить компонент под supabase bookmarks


const computedImagesSrc = computed(() => {

  const errorImage =
      '/assets/errorImageMovie/errorImage.jpg'

  if (props.mode === 'tmdb') {

    return props.media.poster_path ||
    props.media.backdrop_path
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
  return props.media.vote_average ? props.media.vote_average : props.media.rating
})

const formatTitle = computed(() => {
  return props.media.title || props.media.name
})

const formatDate = computed(() => {
  return FormatDate(props.media.release_date)
})

const formatRating = computed(() => {

  if (rating.value) {
    return FormatRating(rating.value)
  }
})
const formatLink = computed<string>((): string => {
  return `/${props.media.media_type}/${createSlug((props.media.tmdb_id || props.media.id), (props.media.title || props.media.name))}`
})

</script>

<style scoped>

</style>

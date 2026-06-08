<template>
  <NuxtLink
      v-if="media"
      :to="formatLink"
      class="hover:opacity-90 relative overflow-hidden smoothie-card rounded-xl block">

    <div class="relative h-[262px]">
      <NuxtImg :src="computedImagesSrc" class="h-full object-cover w-full "/>
      <div
          class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"/>
      <div v-if="media.vote_count"
           class="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold text-white backdrop-blur-md z-10"
           :class="statusClass">
        {{ media.vote_count }}
      </div>
      <div
          v-if="rating"
          class="rating z-10">
        💎 {{ formatRating }}
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
import type {TmdbMovieProps} from "~/types/tmdb.types";
import {createSlug} from "~/utils/createSlug";

const props = defineProps<TmdbMovieProps>()

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
  return `/${props.media.media_type}/${createSlug(props.media.id, (props.media.title || props.media.name))}`
})

console.log('props Card', props)

</script>

<style scoped>

</style>

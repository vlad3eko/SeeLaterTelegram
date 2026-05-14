<template>
  <NuxtLink
      v-if="movie"
      :to="`/update/${movie.id}`"
      class="hover:opacity-90 relative overflow-hidden">

    <div class="relative h-[262px]">
      <NuxtImg :src="computedImagesSrc" class="h-full object-cover"/>
      <div
          class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"
      />
      <div v-if="statusClass"
           class="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md z-10"
           :class="statusClass"
      >
        {{ movie.status }}
      </div>
      <div
          v-if="rating"
          class="rating z-10"
      >
        ⭐ {{ formatRating }}
      </div>

    </div>
    <div
        class="absolute bottom-0 left-1/2 -translate-x-1/2 text-center p-5 flex flex-col gap-4 text-accent  w-full">
      <div class="text-sm">
        <span class="font-bold">
          {{ movie.title }}
        </span>

        <p
            v-if="movie.release_date"
            class=" text-info mt-1 "
        >
          {{ formatDate }}
        </p>
      </div>
    </div>
  </NuxtLink>
</template>

<script lang="ts" setup>


import {FormatRating, FormatDate} from "~/utils/formatMoviesData";
import type {MovieCardProps, MovieStatus} from "~/types/movie.types";
import type {TmdbMovieProps} from "~/types/tmdb.types";

const props = withDefaults(defineProps<MovieCardProps | TmdbMovieProps>(), {
  mode: 'default'
})

const computedImagesSrc = computed(() => {

  const errorImage =
      '/assets/errorImageMovie/errorImage.jpg'

  if (props.mode === 'tmdb') {

    return props.movie.poster_path ||
    props.movie.backdrop_path
        ? `https://image.tmdb.org/t/p/w600_and_h900_face/${
            props.movie.poster_path ||
            props.movie.backdrop_path
        }`
        : errorImage
  }

  return props.movie.poster_path || errorImage
})

const statusClass = computed<string>(() => {

  if (props.mode === 'tmdb') {
    return ''
  }

  switch (props.movie.status) {

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

  return props.mode === 'tmdb'
      ? props.movie.vote_average
      : props.movie.rating
})

const formatDate = computed(() => {
  return FormatDate(props.movie.release_date)
})

const formatRating = computed(() => {
  const rating =
      props.mode === 'tmdb'
          ? props.movie.vote_average
          : props.movie.rating

  if (rating) {
    return FormatRating(rating)
  }
})

</script>

<style scoped>

</style>

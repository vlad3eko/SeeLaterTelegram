<template>

  <NuxtLink
      v-if="movie"
      :to="`/update/${movie.id}`"
      class="hover:opacity-90 relative overflow-hidden">

    <div class="relative h-[262px]">
      <img
          :src="movie.poster_url"
          :alt="movie.title"
          class="w-full h-full object-cover"
      />
      <div
          class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"
      />
      <div
          class="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md z-10"
          :class="statusClass"
      >
        {{ movie.status }}
      </div>
      <div
          v-if="movie.rating"
          class="rating z-10"
      >
        ⭐ {{ movie.rating }}
      </div>

    </div>
    <div
        class="absolute bottom-0 left-1/2 -translate-x-1/2 text-center p-5 flex flex-col gap-4 text-accent-foreground  w-full">
      <div class="text-sm">
        <span class="font-bold">
          {{ movie.title }}
        </span>

        <p
            v-if="movie.release_date"
            class=" text-info mt-1 "
        >
          {{ movie.release_date }}
        </p>
      </div>

    </div>

    <!--    <button
            @click="movieStore.deleteMovie(movie.id)"
            class="absolute bottom-0 right-0 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-80 transition cursor-pointer"
        >
          Delete
        </button>-->
  </NuxtLink>

</template>

<script lang="ts" setup>

import type {MovieCardProps, MovieStatus} from "~/types/movie.types";
import {useMovieStore} from "~/stores/movies";

const props = defineProps<MovieCardProps>()
const movie = computed(() => props.movie)

const movieStore = useMovieStore()

const statusClass = computed<MovieStatus>(() => {
  switch (movie.value.status) {

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

</script>

<style scoped>

</style>

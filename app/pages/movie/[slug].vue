<template>
  <div class="relative min-h-[600px] overflow-hidden">

    <!-- BACKGROUND -->
    <NuxtImg
        :src="image"
        class="w-full h-full object-cover absolute inset-0"
    />

    <!-- DARK GRADIENT -->
    <div
        class="absolute inset-0
               bg-gradient-to-r
               from-accent
               via-accent/50
               to-accent/20
               bg-white/30 backdrop-blur-md"
    />

    <!-- EXTRA BLUR -->
    <div
        class="absolute inset-0 backdrop-blur-[2px]"
    />

    <!-- CONTENT -->
    <div class="relative z-10 container mx-auto px-8 py-20">

      <div class="grid grid-cols-[300px_1fr] gap-10">

        <!-- POSTER -->
        <NuxtImg
            :src="image"
            class="w-[300px] rounded-2xl shadow-2xl"
        />

        <!-- INFO -->
        <div class="">

          <h1 class="text-5xl font-bold">
            {{ data?.title }}
          </h1>

          <p class="text-info mt-3">
            {{ data?.release_date }}
          </p>

          <div class="mt-8">
            {{ data?.overview }}
          </div>

          <div class="flex gap-10 my-12 items-center">

            <span class="material-symbols-outlined cursor-pointer">
              heart_plus
            </span>

            <span @click="handleAddMovie()"
                  class="material-symbols-outlined cursor-pointer">
                playlist_add
            </span>


            <NuxtLink v-if="trailer" :to="`https://www.youtube.com/watch?v=`+trailer?.key" target="_blank"
                      class="flex items-center gap-3 cursor-pointer">
              <span class="material-symbols-outlined">
                  video_frame_copy
              </span>
              <span class="hover:underline">
              Смотреть трейлер
              </span>
            </NuxtLink>
          </div>

        </div>

      </div>

    </div>
  </div>
</template>

<script lang="ts" setup>
import type {TmdbMovieDetails} from "~/types/tmdb.types";
import {useMovieStore} from "~/stores/movies.store";
import {mapTmdbMovie} from "~/utils/mapTmdbMovie";

const id = useRoute().params.slug

defineProps()
const movieStore = useMovieStore()

const image = computed(() => {

  const path = data.value?.poster_path || data.value?.backdrop_path

  return path
      ? `https://image.tmdb.org/t/p/w600_and_h900_face${path}`
      : '/assets/errorImageMovie/errorImage.jpg'
})

const data = ref<TmdbMovieDetails | null>(null)
const loader = ref<boolean>(true)

const handleAddMovie = () => {

  const movie = data.value
  if (!movie)  return

   movieStore.createMovie(mapTmdbMovie(movie))
}

const trailer = computed(() => {
  const priorityRu = data.value?.trailers.find(
      trailer => trailer.name === "20th Anniversary Trailer")

  const youtubeRu = data.value?.trailers.find(
      trailer => trailer.site === 'YouTube')

  return priorityRu || youtubeRu
})

onMounted(async () => {
  loader.value = true

  data.value = await $fetch('/api/tmdb/movie', {
    query: {
      id
    }
  })

  loader.value = false
})

</script>

<style scoped>

</style>

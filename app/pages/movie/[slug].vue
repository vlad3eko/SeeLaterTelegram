<template>

  <div class="relative min-h-screen overflow-hidden">

    <!-- BACKGROUND -->
    <NuxtImg
        :src="image"
        class="absolute inset-0 w-full h-full object-cover select-none"
    />

    <!-- OVERLAY -->
    <div
        class="absolute inset-0
               bg-gradient-to-b
               md:bg-gradient-to-r
               from-accent
               via-accent/70
               to-accent/30
               backdrop-blur-md"
    />

    <!-- CONTENT -->
    <div class="relative z-10 container mx-auto px-4 md:px-8 py-10 md:py-20">

      <Loader v-if="loader"/>

      <Transition name="fade" mode="out-in">

        <div
            v-if="!loader && data"
            class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 lg:gap-10"
        >
          <iframe
              v-if="trailer"
              class="w-full h-[450px] aspect-video rounded-2xl shadow-2xl block lg:hidden"
              :src="`https://www.youtube.com/embed/${trailer.key}`"
              allowfullscreen
          />
          <!-- LEFT COLUMN -->
          <div class="w-full max-w-[300px] mx-auto lg:mx-0">


            <!-- POSTER -->
            <NuxtImg
                :src="image"
                class="w-full rounded-2xl shadow-2xl"
            />

            <!-- INFO -->
            <div class="flex items-center justify-between mt-4 px-2">

              <p class="text-info text-sm">
                {{ FormatDate(data.release_date) }}
              </p>

              <!-- ACTIONS -->
              <div class="flex items-center gap-3 select-none">

                <span class="material-symbols-outlined cursor-pointer hover:scale-110 transition">
                  heart_plus
                </span>

                <span
                    @click="handleAddMovie"
                    class="material-symbols-outlined cursor-pointer hover:scale-110 transition"
                >
                  playlist_add
                </span>

              </div>

            </div>

          </div>

          <!-- RIGHT COLUMN -->
          <div class="flex flex-col gap-6">

            <!-- TRAILER -->
            <iframe
                v-if="trailer"
                class="w-full h-[450px] aspect-video rounded-2xl shadow-2xl hidden lg:block"
                :src="`https://www.youtube.com/embed/${trailer.key}`"
                allowfullscreen
            />

            <!-- TEXT -->
            <div>

              <h1 class="text-3xl md:text-5xl font-bold leading-tight">
                {{ data.title }}
              </h1>

              <div class="border-b border-accent-foreground/20 my-4"/>

              <p class="leading-7 md:leading-8 text-base md:text-lg text-accent-foreground/90">
                {{ data.overview }}
              </p>

            </div>

          </div>

        </div>

      </Transition>

    </div>

  </div>

</template>

<script lang="ts" setup>

import type {TmdbMovieDetails} from "~/types/tmdb.types";
import {useMovieStore} from "~/stores/movies.store";
import {mapTmdbMovie} from "~/utils/mapTmdbMovie";
import Loader from "~/components/composables/Loader.vue";
import {FormatDate} from "~/utils/formatMoviesData";

const id = useRoute().params.slug

const movieStore = useMovieStore()

const data = ref<TmdbMovieDetails | null>(null)
const loader = ref<boolean>(true)

const image = computed(() => {

  const path =
      data.value?.poster_path ||
      data.value?.backdrop_path

  return path
      ? `https://image.tmdb.org/t/p/original${path}`
      : '/assets/errorImageMovie/errorImage.jpg'
})

const trailer = computed(() => {

  const priority = data.value?.trailers.find(
      trailer =>
          trailer.site === 'YouTube' &&
          trailer.type === 'Trailer'
  )

  return priority || null
})

const handleAddMovie = () => {

  if (!data.value) return

  movieStore.createMovie(
      mapTmdbMovie(data.value)
  )
}

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


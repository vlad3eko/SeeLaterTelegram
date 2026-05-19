<template>
  <div class="relative min-h-[50%]">

    <!-- BACKGROUND -->
    <NuxtImg
        :src="image"
        class="absolute inset-0 w-full h-full object-cover select-none"
    />

    <!-- OVERLAY -->
    <div
        class="absolute inset-0
               bg-gradient-to-b
               lg:bg-gradient-to-r
               from-accent
               via-accent/70
               to-accent/30
               backdrop-blur-md"
    />

    <!-- CONTENT -->
    <div class="relative z-10 container mx-auto px-4 md:px-8 py-10 md:py-20">

      <Loader v-if="pending"/>

      <Transition v-if="!pending && data" name="fade" mode="out-in">

        <div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 lg:gap-10">

          <!-- LEFT COLUMN -->
          <div class="w-full mx-auto lg:mx-0 max-md:w-100 max-lg:w-150">

            <div class="sticky top-5">

              <!-- POSTER -->
              <div class="overflow-hidden rounded-t-2xl shadow-2xl relative">

                <NuxtImg
                    :src="image"
                    class="w-full object-cover"
                />

                <!-- TOP INFO -->
                <div class="absolute top-0 inset-x-0 flex items-center justify-between p-3 z-10">

                  <p class="text-xl font-bold bg-panel/90 backdrop-blur px-4 py-2 rounded-2xl">
                    🍿 {{ data.vote_count }}
                  </p>

                  <p class="text-2xl font-bold bg-panel/90 backdrop-blur px-4 py-2 rounded-2xl">
                    {{ FormatRating(data.vote_average) }}
                  </p>

                </div>
                <!-- IMAGE GRADIENT -->
                <div
                    class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"
                />


              </div>

              <!-- ACTIONS -->
              <div
                  class="bg-panel rounded-b-2xl
               flex items-center justify-between gap-3
               px-4 py-4"
              >

      <span
          @click="handleAddMovie"
          class="material-symbols-outlined
                 cursor-pointer hover:scale-125
                 transition text-price"
      >
        thumb_up
      </span>

                <UiButton
                    @click="handleAddMovie"
                    class="flex-1"
                >
                  Сохранить
                </UiButton>

                <span
                    @click="handleAddMovie"
                    class="material-symbols-outlined
                 cursor-pointer hover:scale-125
                 transition text-error"
                >
        thumb_down
      </span>

              </div>

              <!-- TAGLINE -->
              <p class="text-center text-muted-foreground mt-4 px-2 italic">
                {{ data?.tagline }}
              </p>

            </div>

          </div>

          <!-- RIGHT COLUMN -->
          <div class="flex flex-col gap-6">

            <!-- PLAYER -->
            <div class="overflow-hidden rounded-2xl bg-shell shadow-2xl">

              <iframe
                  v-if="trailer"
                  class="w-full aspect-video md:h-[450px]"
                  :src="`https://www.youtube.com/embed/${trailer.key}`"
                  allowfullscreen
              />

              <!-- PLAYER ACTIONS -->
              <div
                  class="grid grid-cols-2 md:grid-cols-5"
              >

                <span
                    class="py-6 max-lg:py-3 text-center cursor-pointer hover:bg-panel transition"
                >
                  Смотрю
                </span>

                <span
                    class="py-6 max-lg:py-3 text-center cursor-pointer hover:bg-panel transition"
                >
                  Смотрел
                </span>

                <UiButton
                    @click="handleAddMovie"
                    class="rounded-none"
                >
                  Сохранить
                </UiButton>

                <span
                    class="py-6 max-lg:py-3 text-center cursor-pointer hover:bg-panel transition"
                >
                  Бросил
                </span>

                <span
                    class="py-6 max-lg:py-3 text-center cursor-pointer hover:bg-panel transition"
                >
                  Не смотрел
                </span>

              </div>

            </div>

            <!-- TITLE + DESCRIPTION -->
            <div>

              <h1 class="text-3xl md:text-5xl font-bold leading-tight">
                {{ data.title }}
              </h1>

              <div class="border-b my-4 border-accent-foreground/20"/>

              <div
                  class="max-w-4xl
                         leading-7 md:leading-8
                         text-base md:text-lg
                         text-accent-foreground/90"
              >
                {{ data.overview }}
              </div>

            </div>

            <!-- GENRES -->
            <div class="flex flex-col gap-3 items-start">
              <p>
                Жанр:
                <UiButton v-for="genres in data?.genres"
                          class="w-max p-3 mr-3 bg-shell text-center cursor-pointer hover:bg-panel text-muted-foreground">
                  {{ genres.name }}
                </UiButton>
              </p>
              <div class="flex gap-3 items-center">
                Продолжительность: {{ runtimeConvert(data.runtime) }}
              </div>
              <p>
                Страна:
                <UiButton v-for="country in data?.origin_country"
                          class="w-max p-3 mr-3 bg-shell text-center cursor-pointer hover:bg-panel text-muted-foreground">
                  {{ country }}
                </UiButton>
              </p>
              <p class="">
                <span>Дата выхода: </span>
                {{ dateConvert(data.release_date) }}
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
import {FormatRating} from "~/utils/formatMoviesData";

const id = useRoute().params.slug

const movieStore = useMovieStore()

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

const {data, pending} = await useAsyncData<TmdbMovieDetails>(`movie-${id}`,
    () => $fetch('/api/tmdb/movie', {
      query: {
        id
      }
    }))

const runtimeConvert = (totalMinutes: number) => {
  const hour = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (minutes === 0) {
    return ` ${hour} ч.`
  }

  if (hour === 0) {
    return `${minutes} мин.`
  }

  if (hour && minutes) {
    return `${hour} ч. ${minutes} мин.`
  }

  return `-`
}

const dateConvert = (date: string) => {
  return date
      .split('-')
      .reverse()
      .join('.')
}

</script>

<style scoped>

</style>


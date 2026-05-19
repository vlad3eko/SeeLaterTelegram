<template>
  <div class="relative min-h-[50%] overflow-hidden">
    <NuxtImg
        :src="image"
        class="absolute inset-0 w-full h-full object-cover select-none"/>
    <div class="absolute inset-0
               bg-gradient-to-b
               md:bg-gradient-to-r
               from-accent
               via-accent/70
               to-accent/30
               backdrop-blur-md"/>
    <div class="relative z-10 container mx-auto px-4 md:px-8 py-10 md:py-20">
      <Loader v-if="pending"/>

      <Transition v-if="!pending && data" name="fade" mode="out-in">
        <div>
          <p class="text-center text-2xl pb-3">
            {{ statusConvert(data.status) }}
            {{ dateConvert(data.release_date) }}
          </p>
          <iframe
              v-if="trailer"
              class="w-full h-[450px] aspect-video rounded-2xl shadow-2xl"
              :src="`https://www.youtube.com/embed/${trailer.key}`"/>
          <div class="flex gap-1 justify-between mb-3
          [&>*:first-child]:rounded-tl-2xl [&>*:first-child]:rounded-bl-2xl
          [&>*:last-child]:rounded-tr-2xl [&>*:last-child]:rounded-br-2xl">
            <span class="p-3 bg-shell w-full text-center cursor-pointer hover:bg-panel">Смотрю</span>
            <span class="p-3 bg-shell w-full text-center cursor-pointer hover:bg-panel">Смотрел</span>
            <UiButton
                @click="handleAddMovie"
                class="w-full text-center cursor-pointer">
              Сохранить
            </UiButton>
            <span class="p-3 bg-shell w-full text-center cursor-pointer hover:bg-panel">Бросил</span>
            <span class="p-3 bg-shell w-full text-center cursor-pointer hover:bg-panel">Не смотрел</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 lg:gap-10">
            <div class="w-full mx-auto lg:mx-0">
              <div class="relative">
                <NuxtImg
                    :src="image"
                    class="w-full rounded-2xl shadow-2xl"/>

                <div class="w-full absolute top-0 flex items-center justify-between">
                  <p class="text-2xl font-bold bg-panel flex item-center px-3 pb-3 pt-4 rounded-br-2xl rounded-tl-2xl">
                    🍿{{ data.vote_count }}</p>
                  <p class="text-3xl font-bold bg-panel px-3 pb-3 pt-3 rounded-bl-2xl rounded-tr-2xl">
                    {{ FormatRating(data.vote_average) }}</p>
                </div>
                <div class="absolute inset-0 bg-gradient-to-t rounded-2xl from-black/50 via-black/30 to-transparent"/>
              </div>
              <div class="mt-[-10px] pt-5 bg-panel flex justify-between items-center gap-3 px-6 py-3 text-center ">
              <span
                  @click="handleAddMovie"
                  class="material-symbols-outlined cursor-pointer hover:scale-130 transition text-price">
                  thumb_up
               </span>
                <UiButton
                    @click="handleAddMovie"
                    class="w-full text-center cursor-pointer">
                  Сохранить
                </UiButton>
                <span
                    @click="handleAddMovie"
                    class="material-symbols-outlined cursor-pointer hover:scale-130 transition text-error">
                  thumb_down
               </span>
              </div>
              <p class="text-xl px-3 text-center text-muted-foreground ">
                {{ data?.tagline }}
              </p>

            </div>
            <div class="flex flex-col gap-6">
              <div>
                <h1 class="text-3xl md:text-5xl font-bold leading-tight">
                  {{ data.title }}
                </h1>
                <div class="border-b border-accent-foreground/20 my-4"/>
                <p class="leading-7 md:leading-8 text-base md:text-lg text-accent-foreground/90">
                  {{ data.overview }}
                </p>
              </div>
              <div class="flex flex-col gap-3 items-start">
                <p>
                  Жанр:
                  <UiButton v-for="genres in data.genres"
                            class="w-max p-3 mr-3 bg-shell w-full text-center cursor-pointer hover:bg-panel text-muted-foreground">
                    {{ genres.name }}
                  </UiButton>
                </p>
                <div class="flex gap-3 items-center">
                  Продолжительность: {{ runtimeConvert(data.runtime) }}
                </div>
                <p>
                  Страна:
                  <UiButton v-for="country in data.origin_country"
                            class="w-max p-3 mr-3 bg-shell w-full text-center cursor-pointer hover:bg-panel text-muted-foreground">
                    {{ country }}
                  </UiButton>
                </p>
              </div>

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
import {FormatDate, FormatRating} from "~/utils/formatMoviesData";

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

const statusConvert = (status: string) => {
  if (status === 'Released') {
    return `Вышел`
  } else {
    return `Пока не вышел`
  }
}

</script>

<style scoped>

</style>


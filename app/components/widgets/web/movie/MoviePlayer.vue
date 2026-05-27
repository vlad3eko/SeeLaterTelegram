<template>
  <div class="overflow-hidden rounded-2xl bg-shell shadow-2xl">
    <iframe v-if="trailer"
            class="w-full aspect-video md:h-[450px]"
            :src="`https://www.youtube.com/embed/${trailer?.key}`"
            allowfullscreen/>

    <!-- PLAYER ACTIONS -->
    <div class="grid grid-cols-2 md:grid-cols-5">
                <span class="py-6 max-lg:py-3 text-center cursor-pointer hover:bg-panel transition">
                  Смотрю
                </span>
      <span class="py-6 max-lg:py-3 text-center cursor-pointer hover:bg-panel transition">
                  Смотрел
                </span>
      <UiButton @click="handleAddMovie"
                class="rounded-none">
        Сохранить
      </UiButton>
      <span class="py-6 max-lg:py-3 text-center cursor-pointer hover:bg-panel transition">
                  Бросил
                </span>
      <span class="py-6 max-lg:py-3 text-center cursor-pointer hover:bg-panel transition">
                  Не смотрел
                </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {useMovieDetails} from "~/composables/movie/useMovieDetails";

const {
  trailer,
  handleAddMovie,
} = useMovieDetails()

</script>

<style scoped>

</style>

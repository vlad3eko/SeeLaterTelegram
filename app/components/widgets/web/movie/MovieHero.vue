
<template>
  <!-- На телефоне постер не шире экрана (было w-100 = 400px — страница уезжала вбок) -->
  <div class="w-full max-w-sm mx-auto lg:max-w-none lg:mx-0">
    <div class="lg:sticky lg:top-[calc(var(--site-chrome-h,0px)+1.25rem)]">

      <!-- POSTER -->
      <div class="overflow-hidden rounded-2xl shadow-2xl relative">
        <NuxtImg
            :src="imageCheck(data)"
            class="w-full object-cover select-none"/>

        <div class="absolute top-0 inset-x-0 flex items-center justify-between p-3 z-10">
          <p class="text-xl font-bold bg-panel/90 backdrop-blur px-4 py-2 rounded-xl">
            🍿 {{ data?.vote_count }}
          </p>
          <p class="text-2xl font-bold bg-panel/90 backdrop-blur px-4 py-2 rounded-xl">
            {{ FormatRating(data?.vote_average) }}
          </p>
        </div>

        <div
            class="absolute inset-0 rounded-md
               bg-gradient-to-t
               from-black/50
               via-white/1
               to-white/5"/>

        <div class="absolute bottom-3 left-3 flex gap-3 w-full">
          <span class="text-white/70">{{ runtimeConvert(data?.runtime) }}</span>
        </div>


        <div class="absolute bottom-3 right-3 flex gap-3">

          <button type="button"
                  @click="handleAddMovie"
                  :disabled="favoriteBusy"
                  :title="isSaved ? 'Убрать из сохранённых' : 'Сохранить'"
                  :aria-pressed="isSaved"
                  class="material-symbols-outlined cursor-pointer hover:scale-125 transition text-primary disabled:opacity-50"
                  :style="{fontVariationSettings: isSaved ? `'FILL' 1` : `'FILL' 0`}">
            favorite
          </button>
        </div>
      </div>
      <p v-if="favoriteMessage"
         class="text-center text-sm mt-2 text-accent-foreground bg-shell/80 rounded-xl px-3 py-1">
        {{ favoriteMessage }}
      </p>
      <div class="flex justify-center">
        <p class="text-accent-foreground w-max bg-shell px-5 py-1 pb-1 rounded-b-2xl text-center ">
          <span>Дата выхода: </span>
          {{ mediaReleaseConvert(data) }}</p>
      </div>
      <!-- TAGLINE -->
      <p class="text-center text-muted-foreground mt-4 px-2  italic">
        {{ data?.tagline }}
      </p>
    </div>
  </div>
</template>

<script lang="ts" setup>

import {useMovieDetails} from "~/composables/movie/useMovieDetails";
import {dateConvert} from "~/utils/convert/dateConvert";
import {runtimeConvert} from "~/utils/convert/runtimeConvert";
import {imageCheck} from "~/utils/imageCheck";
import {mediaReleaseConvert} from "~/utils/convert/mediaConvert";

const {
  data,
  handleAddMovie,
  isSaved,
  favoriteBusy,
  favoriteMessage,
} = useMovieDetails()

</script>

<style scoped>

</style>

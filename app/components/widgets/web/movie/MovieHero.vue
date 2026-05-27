<template>
  <div class="w-full mx-auto lg:mx-0 max-md:w-100 max-lg:w-150">
    <div class="sticky top-5">

      <!-- POSTER -->
      <div class="overflow-hidden rounded-2xl shadow-2xl relative">
        <NuxtImg
            :src="imageCheck(data)"
            class="w-full object-cover select-none"/>

        <!-- TOP INFO -->
        <div class="absolute top-0 inset-x-0 flex items-center justify-between p-3 z-10">
          <p class="text-xl font-bold bg-panel/90 backdrop-blur px-4 py-2 rounded-xl">
            🍿 {{ data?.vote_count }}
          </p>
          <p class="text-2xl font-bold bg-panel/90 backdrop-blur px-4 py-2 rounded-xl">
            {{ FormatRating(data?.vote_average) }}
          </p>
        </div>

        <!-- IMAGE GRADIENT -->
        <div
            class="absolute inset-0 rounded-md
               bg-gradient-to-t
               from-black/50
               via-white/1
               to-white/5"/>

        <!-- ACTIONS -->
        <div class="absolute bottom-3 left-3 flex gap-3 w-full">
          <span class="text-white/70">{{ runtimeConvert(data?.runtime) }}</span>
        </div>


        <div class="absolute bottom-3 right-3 flex gap-3">

                <span @click="handleAddMovie"
                      class="material-symbols-outlined
                 cursor-pointer hover:scale-125
                 transition text-primary">
                 favorite
               </span>
          <span @click="handleAddMovie"
                class="material-symbols-outlined
                 cursor-pointer hover:scale-125
                 transition text-white">
                  playlist_add
                </span>
        </div>
      </div>
      <div class="flex justify-center">
        <p class="text-accent-foreground w-max bg-shell px-5 py-1 pb-1 rounded-b-2xl text-center ">
          <span>Дата выхода: </span>
          {{ dateConvert(data?.release_date) }}</p>
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


const {
  data,
  handleAddMovie,
} = useMovieDetails()

</script>

<style scoped>

</style>

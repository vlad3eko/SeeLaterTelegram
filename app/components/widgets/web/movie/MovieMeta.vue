<template>
  <div class="flex flex-col gap-3 items-start">
    <p class="text-muted-foreground font-bold letter">
      Жанр:
      <UiButton v-for="genres in data.genres"
                class="w-max p-3 mr-3 bg-shell text-center cursor-pointer hover:bg-panel text-accent-foreground">
        {{ genres.name }}
      </UiButton>
    </p>
    <p class="flex gap-3 items-center text-muted-foreground font-bold letter">
      Продолжительность:
      <span class="text-accent-foreground">{{ runtimeConvert(data.runtime) }}</span>
    </p>
    <p class="text-muted-foreground font-bold letter">
      Страна:
      <UiButton v-for="country in data.origin_country"
                class="w-max p-3 mr-3 bg-shell text-center cursor-pointer hover:bg-panel text-accent-foreground">
        {{ country }}
      </UiButton>
    </p>
    <p class=" text-muted-foreground font-bold letter">
      Дата выхода:
      <span class="text-accent-foreground">{{ dateConvert(data.release_date) }}</span>
    </p>
  </div>
</template>

<script lang="ts" setup>

import {runtimeConvert} from "~/utils/movie/runtimeConvert";
import {dateConvert} from "~/utils/movie/dateConvert";
import {useMovieDetails} from "~/components/composables/movie/useMovieDetails";

const {
  image,
  data,
} = useMovieDetails()

</script>

<style scoped>

</style>

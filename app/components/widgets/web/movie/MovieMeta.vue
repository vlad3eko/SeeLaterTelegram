<template>
  <div class="flex flex-col gap-3 items-start">
    <p class="text-muted-foreground font-bold letter">
      Жанр:
      <UiButton variant="secondary" v-for="genres in data?.genres">
        {{ genres.name }}
      </UiButton>
    </p>
    <p class="flex gap-3 items-center text-muted-foreground font-bold letter">
      Продолжительность:
      <span class="text-accent-foreground">{{ mediaDurationConvert(data) }}</span>
    </p>
    <p class="text-muted-foreground font-bold letter">
      Страна:
      <UiButton variant="secondary" v-for="country in data?.production_countries">
        {{ country.name }}
      </UiButton>
    </p>
    <p class=" text-muted-foreground font-bold letter">

      Дата выхода:
      <span class="text-accent-foreground">{{ mediaReleaseConvert(data) }}</span>
    </p>
    <p class=" text-muted-foreground font-bold letter">
      Дата выхода:
      <UiButton variant="secondary">{{ mediaTypeConvert(data) }}</UiButton>
    </p>
  </div>
</template>

<script lang="ts" setup>

import {useMovieDetails} from "~/composables/movie/useMovieDetails";
import {mediaDurationConvert, mediaReleaseConvert, mediaTypeConvert} from "~/utils/convert/mediaConvert";

const {
  data,
} = useMovieDetails()

console.log('data', data.value)
</script>

<style scoped>

</style>

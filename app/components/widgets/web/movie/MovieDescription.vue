<template>
  <div>
    <h1 class="text-3xl md:text-5xl font-bold leading-tight">
      {{ title }}
    </h1>
    <div class="border-b my-4 border-accent-foreground/20"/>
    <div class="max-w-full text-wrap
                leading-7 md:leading-8
                text-base md:text-lg
                text-accent-foreground/90">
      {{ data?.overview }}
    </div>
  </div>
</template>

<script lang="ts" setup>

import {useMovieDetails} from "~/composables/movie/useMovieDetails";

const {
  data,
} = useMovieDetails()

const title = computed(() => {

  if (data.value) {
    return data.value.media_type === 'tv' ? data.value?.name : data.value?.title
   }
})

</script>

<style scoped>

</style>

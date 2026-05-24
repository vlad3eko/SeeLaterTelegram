<template>
  <div>
    <h1 class="text-3xl md:text-5xl font-bold leading-tight">
      {{ data?.title }}
    </h1>
    <div class="border-b my-4 border-accent-foreground/20"/>
    <div class="max-w-4xl
                leading-7 md:leading-8
                text-base md:text-lg
                text-accent-foreground/90">
      {{ data?.overview }}
    </div>
  </div>
</template>

<script lang="ts" setup>

import {useMovieDetails} from "~/components/composables/movie/useMovieDetails";

const {
  data,
} = useMovieDetails()

</script>

<style scoped>

</style>

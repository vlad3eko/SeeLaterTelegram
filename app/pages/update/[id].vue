<template>
  <loader v-if="useStoreMovies.loading"/>

  <div v-if="useStoreMovies.movie">
    <SmoothiesCreate :card="useStoreMovies.movie" mode="update"/>
  </div>
</template>

<script lang="ts" setup>


import SmoothiesCreate from "~/components/layout/SmoothiesCreate.vue";
import Loader from "~/components/composables/Loader.vue";
import {useMovieStore} from "~/stores/movies.store";

const id = Number(useRoute().params.id)
const useStoreMovies = useMovieStore()

onMounted(() => {
  useStoreMovies.getMovie(id)
})
</script>

<style scoped>

</style>

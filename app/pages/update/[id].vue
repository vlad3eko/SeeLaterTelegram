<template>
  <loader v-if="movieStore.loading"/>

  <div v-if="movieStore.movie">
    <SmoothiesCreate :card="movieStore.movie" mode="update"/>
  </div>
</template>

<script lang="ts" setup>


import SmoothiesCreate from "~/components/layout/SmoothiesCreate.vue";
import Loader from "~/components/composables/Loader.vue";
import {useMovieStore} from "~/stores/movies.store";

const id = Number(useRoute().params.id)
const movieStore = useMovieStore()

onMounted(() => {
  movieStore.getMovie(id)
})
</script>

<style scoped>

</style>

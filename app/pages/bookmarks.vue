<template>
  <loader v-if="movieStore.loading"/>

<section v-if="!movieStore.loading">
  <div class="my-10 flex gap-3 w-max">
    <UiButton @click="movieStore.getMovies('created_at')">Date</UiButton>
    <UiButton @click="movieStore.getMovies('title')">Title</UiButton>
    <UiButton @click="movieStore.getMovies('rating')">Rating</UiButton>
  </div>
  <CatalogList :movies="movieStore.movies || []"/>
</section>
</template>

<script lang="ts" setup>

import CatalogList from "~/components/widgets/app/catalog/CatalogList.vue";
import Loader from "~/components/composables/Loader.vue";

const movieStore = useMovieStore()

onMounted(() => {
  movieStore.getMovies()
})
</script>

<style scoped>

</style>

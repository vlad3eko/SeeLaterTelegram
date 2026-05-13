<template>
  <Loader v-if="movieStore.loading"/>

  <div v-else class="container mx-auto my-10">
    <div class="my-10 flex gap-3 w-max">
      <UiButton @click="movieStore.getMovies('created_at')">Date</UiButton>
      <UiButton @click="movieStore.getMovies('title')">Title</UiButton>
      <UiButton @click="movieStore.getMovies('rating')">Rating</UiButton>
    </div>

    <div class="smoothie-grid">
       <div v-for="movie in props.movies" :key="movie.id" class="smoothie-card">
         <CatalogCard :movie="movie"/>
       </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import CatalogCard from "~/components/widgets/app/catalog/CatalogCard.vue";
import type {MovieCardsProps} from "~/types/movie.types";
import Loader from "~/components/composables/Loader.vue";

const props = defineProps<MovieCardsProps>()
const movieStore = useMovieStore()
</script>

<style scoped>

</style>

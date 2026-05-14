<template>
  <Loader v-if="props.loading"/> <!--TODO loader не выключается при фече tmdb-->

  <div v-else class="container mx-auto my-10">
    <div class="my-10 flex gap-3 w-max">
      <UiButton @click="movieStore.getMovies('created_at')">Date</UiButton>
      <UiButton @click="movieStore.getMovies('title')">Title</UiButton>
      <UiButton @click="movieStore.getMovies('rating')">Rating</UiButton>
    </div>

    <div class="smoothie-grid">
      <div v-for="movie in props.movies" :key="movie.id" class="smoothie-card">
        <CatalogCard :movie="movie" :mode="props.mode"/>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>

import type {MovieCardsProps} from "~/types/movie.types";
import CatalogCard from "~/components/widgets/app/catalog/CatalogCard.vue";
import Loader from "~/components/composables/Loader.vue";
import type {TmdbMoviesProps} from "~/types/tmdb.types";

const props = defineProps<MovieCardsProps | TmdbMoviesProps>()
const movieStore = useMovieStore()

</script>

<style scoped>

</style>

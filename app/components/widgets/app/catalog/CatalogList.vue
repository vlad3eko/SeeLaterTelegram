<template>
  <Loader v-if="props.loading"/> <!--TODO loader не выключается при фече tmdb-->

  <section v-else class="smoothie-grid">
    <div v-for="movie in props.movies" :key="movie.id" class="smoothie-card">
      <CatalogCard :movie="movie" :mode="props.mode"/>
    </div>
  </section>
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

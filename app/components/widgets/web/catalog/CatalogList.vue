<template>
  <Loader v-if="props.loading"/>

  <Transition name="fade" mode="out-in">
  <section v-if="!props.loading" class="smoothie-grid">
    <div v-for="movie in filteredMovies" :key="movie.id" class="smoothie-card">
      <CatalogCard :movie="movie" :mode="props.mode"/>
    </div>
  </section>
  </Transition>
</template>

<script lang="ts" setup>

import type {MovieCardsProps} from "~/types/movie.types";
import CatalogCard from "~/components/widgets/web/catalog/CatalogCard.vue";
import Loader from "~/components/composables/Loader.vue";
import type {TmdbMoviesProps} from "~/types/tmdb.types";

const props = defineProps<MovieCardsProps | TmdbMoviesProps>()
const movieStore = useMovieStore()

const filteredMovies = computed(() => {
  return props.movies.filter(
      movie => (movie.release_date && movie.poster_path)
  )
})

</script>

<style scoped>

</style>

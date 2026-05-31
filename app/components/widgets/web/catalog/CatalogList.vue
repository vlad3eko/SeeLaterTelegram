<template>
  <Loader v-if="props.loading"/>

  <Transition name="fade" mode="out-in">
    <section v-if="!props.loading" class="smoothie-grid">
      <div v-for="movie in filteredMovies" :key="movie.id" class="smoothie-card">
        <CatalogCard :movie="movie"/>
      </div>
    </section>
  </Transition>
</template>

<script lang="ts" setup>

import CatalogCard from "~/components/widgets/web/catalog/CatalogCard.vue";
import Loader from "~/composables/Loader.vue";
import type {TmdbMoviesProps} from "~/types/tmdb.types";

const props = defineProps<TmdbMoviesProps>()

const filteredMovies = computed(() => {
  return props.movies.filter(movie => {
        const description =
            'overview' in movie
                ? movie.overview
                : movie.description
        const releaseDate =
            'release_date' in movie
                ? movie.release_date
                : movie.first_air_date
        const voteCount =
            movie.vote_count >= 10
        /*TODO передалть БД добавить условия voteCount*/
        return releaseDate && movie.poster_path && description
      }
  )
})

</script>

<style scoped>

</style>

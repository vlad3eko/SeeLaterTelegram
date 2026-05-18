<template>
  <Search v-model="searchInput" @search="searchMovies"/>
  <CatalogList
      :movies="movies"
      :loading="pending"
      mode="tmdb"
  />
</template>

<script lang="ts" setup>
import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";
import {useTmdbSearch} from "~/components/composables/useTmdbSearch";
import Search from "~/components/layout/Search.vue";

const {
  movies,
  pending,
  searchInput,
  searchMovies
} = useTmdbSearch()

</script>

<style scoped>

</style>

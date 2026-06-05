<template>
  <SearchPanel v-model="searchInput" @search="searchMovies"/>
  <CatalogList
      :movies="movies"
      :loading="pending"
      mode="tmdb"
  />
</template>

<script lang="ts" setup>
import SearchPanel from "~/components/layout/SearchPanel.vue";
import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";
import {useTmdbSearch} from "~/composables/useTmdbSearch";

const {
  movies,
  pending,
  searchInput,
  searchMovies
} = useTmdbSearch()

</script>

<style scoped>

</style>

<template>
  <SearchPanel v-model="searchInput" @search="searchMovies"/>
  <CatalogList
      :media="movies"
      :loading="pending"
      :show-info="true"
  />
</template>

<script lang="ts" setup>
import SearchPanel from "~/components/layout/SearchPanel.vue";
import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";
import {useTmdbSearch} from "~/composables/useTmdbSearch";
import {sortMediaResults} from "~/utils/media/sortMediaResults";

const {
  movies,
  pending,
  searchInput,
  searchMovies
} = useTmdbSearch()


const filterMedia = computed(() => {
  return sortMediaResults(movies.value)
})


</script>

<style scoped>

</style>

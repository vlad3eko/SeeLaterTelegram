<template>
  <SearchPanel v-model="searchInput" @search="searchMovies"/>
  <CatalogList
      :media="movies"
      :loading="pending"
      :show-info="true"
  />
  <div ref="loadMoreTrigger"></div>
</template>

<script lang="ts" setup>
import SearchPanel from "~/components/layout/SearchPanel.vue";
import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";
import {useTmdbSearch} from "~/composables/useTmdbSearch";
import {useInfiniteScroll} from "~/composables/useInfiniteScroll";

const {
  movies,
  pending,
  searchInput,
  searchMovies,
  loadMore
} = useTmdbSearch()


const {
  target: loadMoreTrigger
} = useInfiniteScroll(
    loadMore,
    pending
)
</script>

<style scoped>

</style>

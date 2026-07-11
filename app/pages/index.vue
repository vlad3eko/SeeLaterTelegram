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

const {
  movies,
  pending,
  searchInput,
  searchMovies,
  loadMore
} = useTmdbSearch()


const loadMoreTrigger = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {

  if (!loadMoreTrigger.value) return

  observer = new IntersectionObserver(async ([entry]) => {

        if (entry.isIntersecting && !pending.value && movies.value.length) {

          await loadMore()
        }

      },
      {
        rootMargin: "300px"
      }
  )

  observer.observe(loadMoreTrigger.value)
})

onUnmounted(() =>  observer?.disconnect())

</script>

<style scoped>

</style>

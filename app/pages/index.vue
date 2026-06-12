<template>
  <SearchPanel v-model="searchInput" @search="searchMovies"/>
  <CatalogList
      :media="filteredMovies"
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

const filteredMovies = computed(() => {

  return movies.value.filter(media => {
        const description = media.overview
        const releaseDate =
            'release_date' in media
                ? media.release_date
                : media.first_air_date
        return releaseDate && media.poster_path && description
      }
  )
})

</script>

<style scoped>

</style>

<template>
  <div class="w-max flex mx-auto my-12 relative">
    <input
        type="text"
        id="title"
        @keydown.enter="searchMovies"
        v-model="searchFilm" class="h-11 border mx-auto w-200 rounded-xl p-3"/>
    <div class="h-full">
      <UiButton @click="searchMovies" class="absolute top-0.5 right-0 w-max py-2 px-12">Поиск</UiButton>
    </div>
  </div>
  <CatalogList
      :movies="movies"
      :loading="pending"
      mode="tmdb"
  />
</template>

<script lang="ts" setup>
import type {TmdbResponse} from "~/types/tmdb.types";
import {useMovieStore} from "~/stores/movies.store";
import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";

const searchFilm = ref<string>('Ножи')

const {data, pending, refresh} = await useAsyncData<TmdbResponse>('movies-search',
    () => $fetch('/api/tmdb/search', {
      query: {
        q: searchFilm.value
      }
    }))

const movies = computed(() => {
  return data.value?.results || []
})

const searchMovies = async () => {
  await refresh()
}

</script>

<style scoped>

</style>

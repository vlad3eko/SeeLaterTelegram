<template>
    <CatalogList
        :movies="data?.results || []"
        :loading="movieStore.loading"
        mode="tmdb"
    />
</template>

<script lang="ts" setup>
import CatalogList from "~/components/widgets/app/catalog/CatalogList.vue";
import type {TmdbResponse} from "~/types/tmdb.types";
import {useMovieStore} from "~/stores/movies.store";

const movieStore = useMovieStore()
const data = ref<TmdbResponse | null>(null)

onMounted(async () => {

  movieStore.loading = true

  data.value = await $fetch('/api/tmdb/search', {
    query: {
      q: 'Последний'
    }
  })

  movieStore.loading = false
})

</script>

<style scoped>

</style>

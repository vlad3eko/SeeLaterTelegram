<template>
<section>
  <CatalogList :movies="movieStore.movies || []"/>
</section>
</template>

<script lang="ts" setup>

import CatalogList from "~/components/widgets/app/catalog/CatalogList.vue";

const movieStore = useMovieStore()

onMounted(() => {
  movieStore.getMovies()
})
</script>

<style scoped>

</style>

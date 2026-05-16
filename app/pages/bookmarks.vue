<template>
  <loader v-if="movieStore.loading"/>


  <Transition name="fade" mode="out-in">
    <section v-if="!movieStore.loading">

      <div class="my-10 flex gap-3 w-max">
        <UiButton @click="movieStore.getMovies('created_at')">Date</UiButton>
        <UiButton @click="movieStore.getMovies('title')">Title</UiButton>
        <UiButton @click="movieStore.getMovies('rating')">Rating</UiButton>
      </div>
      <CatalogList :movies="movieStore.movies || []"/>
      <div v-if="movieStore.movies.length === 0" class="text-error/80">
        Сохранённых фильмов пока нет..

      </div> <!--TODO при первом рендере моргает ошибка что фильмо нет.-->
    </section>
  </Transition>
</template>

<script lang="ts" setup>

import CatalogList from "~/components/widgets/app/catalog/CatalogList.vue";
import Loader from "~/components/composables/Loader.vue";

const movieStore = useMovieStore()

onMounted(() => {
  movieStore.getMovies()
})

</script>

<style scoped>

</style>

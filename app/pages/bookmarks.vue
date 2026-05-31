<template>
  <section class="min-w-133">
    <SearchPanel/>
    <Transition name="fade" mode="in-out">
      <div class="my-10 flex gap-3 w-max">
        <UiButton @click="sortBy = 'created_at'">Date</UiButton>
        <UiButton @click="sortBy = 'title'">Title</UiButton>
        <UiButton @click="sortBy = 'rating'">Rating</UiButton>
      </div>
    </Transition>

    <Transition name="fade" mode="out-in">
      <section v-if="!pending">


          <CatalogList :movies="data?.data || []"/>
        <div v-if="!pending && data?.data?.length === 0" class="text-error/80">
          Сохранённых фильмов пока нет..
          <NuxtLink to="/" class="text-primary hover:underline cursor-pointer">Выбрать фильм</NuxtLink>
        </div>
      </section>
    </Transition>
  </section>
</template>

<script lang="ts" setup>

import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";
import Loader from "~/composables/Loader.vue";
import type {MovieSortField} from "~/types/movie.types";
import SearchPanel from "~/components/layout/SearchPanel.vue";

const sortBy = ref<MovieSortField>('created_at')

const {data, pending} = await useAsyncData(`movies-bookmarks-${sortBy.value}`,
    () => $fetch('/api/movies',
        {
          query: {
            sortBy: sortBy.value
          }
        }),
    {
      watch: [sortBy]
    })

console.log('data', data.value?.data)

</script>

<style scoped>

</style>

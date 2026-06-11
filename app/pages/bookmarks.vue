<template>
  <section class="min-w-133">
    <Transition name="fade" mode="in-out" v-if="!pending">
      <div class="my-10 flex gap-3 w-max">
        <UiButton @click="sortBy = 'created_at'">Date</UiButton>
        <UiButton @click="sortBy = 'title'">Title</UiButton>
        <UiButton @click="sortBy = 'rating'">Rating</UiButton>
      </div>
    </Transition>
    <loader v-if="pending"/>
    <Transition name="fade" mode="out-in">
      <section v-if="!pending">
        <div v-if="!pending && bookmarksMedia?.length === 0" class="text-error/80">
          Сохранённых фильмов пока нет..
          <NuxtLink to="/" class="text-primary hover:underline cursor-pointer">Выбрать фильм</NuxtLink>
        </div>

        <CatalogList :media="bookmarksMedia || []"/>
      </section>
    </Transition>
  </section>
</template>

<script lang="ts" setup>

import type {MovieSortField} from "~/types/movie.types";
import type {TmdbMovieDetails} from "~/types/tmdb.types";
import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";
import Loader from "~/composables/Loader.vue";
import {useUserStore} from "~/stores/user.store";

const sortBy = ref<MovieSortField>('created_at')


const {data: medias} = await useAsyncData(`movies-bookmarks-${sortBy.value}`,
    () => $fetch('/api/:media',
        {
          query: {
            sortBy: sortBy.value
          }
        }),
    {
      watch: [sortBy]
    })

const user = useUserStore()



const favorites = computed(() =>
    medias?.value?.data?.filter(
        item =>
            item.user_id === user.data?.id
    ) ?? []
)

const {data, pending} = useAsyncData<TmdbMovieDetails[]>(
    `bookmarks`,
    () => $fetch('/api/bookmarks', {
      method: 'POST',
      body: {
        favorites: favorites.value
      },
    }),
    {
      watch: [favorites]
    }
)

const bookmarksMedia = computed(() => {
  return data.value
})

console.log('bookmarksMedia', bookmarksMedia)

</script>

<style scoped>

</style>

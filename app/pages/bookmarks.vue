<template>
  <section class="min-w-133">
    <Transition name="fade" mode="in-out" v-if="!pending">
      <div class="my-10 flex gap-3 w-max">
        <UiButton @click="sortBy = 'user_id'">Все</UiButton>
        <UiButton @click="sortBy = 'created_at'">Последние добавленные</UiButton>
        <UiButton @click="sortBy = 'vote_count'">Лучшие оценки</UiButton>
        <UiButton @click="sortBy = 'release_date'">Фильмы которые ещё не вышли</UiButton>
      </div>
    </Transition>
    <loader v-if="pending"/>
    <Transition name="fade" mode="out-in">
      <section v-if="!pending">
        <div v-if="!pending && favorites?.length === 0" class="text-error/80">
          Сохранённых фильмов пока нет..
          <NuxtLink to="/" class="text-primary hover:underline cursor-pointer">Выбрать фильм</NuxtLink>
        </div>

        <CatalogList :media="favorites || []"/>
      </section>
    </Transition>
  </section>
</template>

<script lang="ts" setup>

import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";
import Loader from "~/composables/Loader.vue";
import {useUserStore} from "~/stores/user.store";

const sortBy = ref('user_id')

const {data: medias, pending} = await useAsyncData(`movies-bookmarks-${sortBy.value}`,
    () => $fetch('/api/:media',
        {
          query: {
            sortBy: sortBy.value,
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

</script>

<style scoped>

</style>

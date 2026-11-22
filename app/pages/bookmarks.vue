
<template>
  <section class="min-w-133">
    <Transition name="fade" mode="out-in" v-if="!pending && favorites?.length">
      <div class="my-10 flex gap-3 w-max">
        <UiButton @click="sortBy = 'created_at'">Последние добавленные</UiButton>
        <UiButton @click="sortBy = 'vote_count'">Лучшие оценки</UiButton>
        <UiButton @click="sortBy = 'release_date'">Фильмы которые ещё не вышли</UiButton>
      </div>
    </Transition>
    <loader v-if="pending"/>
    <Transition name="fade" mode="out-in">
      <section v-if="!pending">
        <div v-if="favorites?.length === 0 && isAuth" class="text-error/80">
          Сохранённых фильмов пока нет..
          <NuxtLink to="/" class="text-primary hover:underline cursor-pointer">Выбрать фильм</NuxtLink>
        </div>
        <div v-if="!isAuth" class="text-error/80">
          Чтобы продолжить необходимо
          <button @click="authStore.login" class="text-primary hover:underline cursor-pointer">Войти</button>
        </div>
        <CatalogList :media="favorites || []" :show-info="false"/>
      </section>
    </Transition>
  </section>
</template>

<script lang="ts" setup>

import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";
import Loader from "~/composables/Loader.vue";
import {useUserStore} from "~/stores/user.store";
import {useAuthStore} from "~/stores/auth.store";

const sortBy = ref('created_at')

const authStore = useAuthStore()
const userStore = useUserStore()
const {data, isAuth} = storeToRefs(userStore)

// useRequestFetch: при отрисовке на сервере передаёт cookie сессии браузера — без неё
// /api/:media не знает, кто вошёл, и отдаёт пустой список.
const requestFetch = useRequestFetch()

type FavoritesPage = { results: any[], total_pages?: number }

// Сервер отдаёт избранное вошедшего пользователя страницами по 50 (поле results): собираем все.
const loadFavorites = async () => {
  const all: any[] = []
  for (let page = 1; page <= 20; page++) {
    const response = await requestFetch<FavoritesPage>('/api/:media', {
      query: {page, limit: 50, sortBy: sortBy.value}
    })
    all.push(...(response?.results ?? []))
    if (!response?.total_pages || page >= response.total_pages) break
  }
  return all
}

const {data: favoritesData, pending} = await useAsyncData(
    'movies-bookmarks',
    loadFavorites,
    {
      watch: [
        sortBy,
        () => data?.value?.id
      ]
    }
)

const favorites = computed(() => favoritesData.value ?? [])

</script>

<style scoped>

</style>


<template>
  <section class="w-full max-w-7xl mx-auto px-3">
    <Transition name="fade" mode="out-in" v-if="!pending && favorites?.length">
      <div class="my-10 flex flex-wrap gap-3">
        <UiButton v-for="option in sortOptions" :key="option.value"
                  @click="view = option.value"
                  :class="view === option.value ? 'ring-2 ring-primary' : ''">
          {{ option.label }}
        </UiButton>
      </div>
    </Transition>
    <loader v-if="pending"/>
    <Transition name="fade" mode="out-in">
      <section v-if="!pending">
        <div v-if="favorites?.length === 0 && isAuth" class="text-error/80 my-10">
          Сохранённых фильмов пока нет..
          <NuxtLink to="/" class="text-primary hover:underline cursor-pointer">Выбрать фильм</NuxtLink>
        </div>
        <div v-if="!isAuth" class="text-error/80 my-10">
          Чтобы продолжить необходимо
          <button @click="authStore.login" class="text-primary hover:underline cursor-pointer">Войти</button>
        </div>
        <div v-if="view === 'upcoming' && favorites?.length && !visible.length" class="text-muted-foreground my-6">
          Среди сохранённых нет тайтлов, которые ещё не вышли.
        </div>
        <p v-if="removeError" class="text-error/80 mb-4">{{ removeError }}</p>
        <CatalogList :media="visible" :show-info="false" removable @remove="removeFavorite"/>
      </section>
    </Transition>
  </section>
</template>

<script lang="ts" setup>

import CatalogList from "~/components/widgets/web/catalog/CatalogList.vue";
import Loader from "~/composables/Loader.vue";
import {useUserStore} from "~/stores/user.store";
import {useAuthStore} from "~/stores/auth.store";

useSeoMeta({title: 'Сохранённые'})

type View = 'created_at' | 'vote_count' | 'upcoming'

const sortOptions: { value: View, label: string }[] = [
  {value: 'created_at', label: 'Последние добавленные'},
  {value: 'vote_count', label: 'Лучшие оценки'},
  {value: 'upcoming', label: 'Ещё не вышли'},
]

const view = ref<View>('created_at')

// Сервер сортирует по колонке; «Ещё не вышли» — фильтр по дате выхода поверх последних добавленных.
const sortBy = computed(() => view.value === 'upcoming' ? 'created_at' : view.value)

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

const today = () => new Date().toISOString().slice(0, 10)

const visible = computed(() => {
  if (view.value !== 'upcoming') return favorites.value
  const now = today()
  return favorites.value
      .filter((item: any) => item.release_date && String(item.release_date).slice(0, 10) > now)
      .sort((a: any, b: any) => String(a.release_date).localeCompare(String(b.release_date)))
})

const removeError = ref('')

const removeFavorite = async (media: any) => {
  removeError.value = ''
  const tmdbId = media.tmdb_id || media.id
  const before = favoritesData.value

  // Сразу убираем из списка; при ошибке возвращаем.
  favoritesData.value = (before ?? []).filter((item: any) =>
      !((item.tmdb_id || item.id) === tmdbId && item.media_type === media.media_type))

  try {
    await $fetch('/api/favorites/remove', {
      method: 'POST',
      body: {tmdb_id: tmdbId, media_type: media.media_type}
    })
  } catch (error) {
    console.error('[FAVORITE REMOVE ERROR]', error)
    favoritesData.value = before
    removeError.value = 'Не удалось удалить, попробуйте ещё раз'
  }
}

</script>

<style scoped>

</style>

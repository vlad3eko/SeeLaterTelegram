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

const {data: medias, pending} = await useAsyncData(
    'movies-bookmarks',
    () => $fetch('/api/:media', {
        query: {
          userId: data?.value?.id,
          sortBy: sortBy.value,
        }
      }),
    {
      watch: [
        sortBy,
        () => data?.value?.id
      ]
    }
)

// TODO доделать функцию авторизации

const favorites = computed(() =>

    medias?.value?.data?.filter(
        item =>
            item.user_id === data?.value?.id
    ) ?? []
)

</script>

<style scoped>

</style>

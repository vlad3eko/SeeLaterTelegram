<template>
  <div class="text-accent-foreground bg-accent py-3 text-center">
    <ul class="flex gap-6 justify-center items-center">
      <li>
        <NuxtLink to="/" class="text-xl uppercase font-bold text-primary hover:text-focus">Главная</NuxtLink>
      </li>
      <li>
        <NuxtLink to="/bookmarks" class="text-xl uppercase font-bold text-primary hover:text-focus">Сохранённые
        </NuxtLink>
      </li>
      <ThemeSelect/>
      <li>
        <UiButton @click="loginWithTelegram" class="flex gap-3">
          Войти через Telegram
          <span v-if="pendingAuth">
            <Loader/>
          </span>
        </UiButton>
      </li>
      <li>
        <div v-if="isAuth">
          {{ user.username }}
        </div>

        <div v-else>
          Не авторизован
          {{ user }}
        </div>
      </li>
    </ul>
  </div>
</template>

<script lang="ts" setup>

import ThemeSelect from "~/composables/ThemeSelect.vue";
import {useAuth} from "~/composables/auth/useAuth";
import Loader from "~/composables/Loader.vue";

const {user, isAuth, loginWithTelegram, pendingAuth} = useAuth()
</script>

<style scoped>

</style>

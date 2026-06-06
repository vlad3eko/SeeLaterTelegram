<template>
  <li v-if="!isAuth">
    <UiButton @click="loginWithTelegram" class="flex gap-1">
      Telegram
      <span v-if="pendingAuth">
         <Loader/>
      </span>
      <NuxtImg src="icons/telegram.svg" class="w-6"/>
    </UiButton>
  </li>
  <li>
    <div v-if="isAuth">
      <UiButton @click="logoutTelegramAuth" class="flex gap-1">
        {{ user?.username }}
        <NuxtImg src="icons/telegram.svg" class="w-6"/>
      </UiButton>
    </div>
  </li>
</template>

<script lang="ts" setup>

import Loader from "~/composables/Loader.vue";
import {useAuth} from "~/composables/auth/useAuth";

  const {
    user,
    isAuth,
    loginWithTelegram,
    logoutTelegramAuth,
    pendingAuth
  } = useAuth()
</script>

<style scoped>

</style>

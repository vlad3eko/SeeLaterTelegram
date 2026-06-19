<template>
  <li v-if="!user.isAuth">
    <UiButton @click="isAuth.login" class="flex gap-1">
      Telegram
      <span v-if="isAuth.pendingAuth">
         <Loader/>
      </span>
      <NuxtImg src="icons/telegram.svg" class="w-6"/>
    </UiButton>
  </li>
  <li>
    <div v-if="user.isAuth">
      <UiButton @click="isAuth.logout" class="flex gap-1">
        {{ user.data?.username }}
        <NuxtImg src="icons/telegram.svg" class="w-6"/>
      </UiButton>
    </div>
  </li>
</template>

<script lang="ts" setup>

import Loader from "~/composables/Loader.vue";
import {useUserStore} from "~/stores/user.store";
import {useAuthStore} from "~/stores/auth.store";

const user = useUserStore()
const isAuth = useAuthStore()
</script>

<style scoped>

</style>

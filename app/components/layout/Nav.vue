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
      <Auth/>
    </ul>
  </div>
</template>

<script lang="ts" setup>

import ThemeSelect from "~/composables/ThemeSelect.vue";
import Auth from "~/components/widgets/telegram/Auth.vue";

</script>

<style scoped>

</style>

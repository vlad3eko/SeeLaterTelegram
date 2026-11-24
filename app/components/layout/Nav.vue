
<template>
  <!-- Шапка: на телефоне переносится в две строки, ничего не обрезается -->
  <!-- div, не nav: в smoothies.css глобальный стиль nav (фон, отступы) перебивает утилиты -->
  <div role="navigation" class="text-accent-foreground bg-accent py-2 md:py-3 px-3">
    <ul class="flex flex-wrap gap-x-4 gap-y-2 md:gap-6 justify-center items-center">
      <li>
        <NuxtLink to="/" class="text-base md:text-xl uppercase font-bold text-primary hover:text-focus">Главная</NuxtLink>
      </li>
      <li>
        <NuxtLink to="/bookmarks" class="text-base md:text-xl uppercase font-bold text-primary hover:text-focus">Сохранённые
        </NuxtLink>
      </li>
      <li>
        <ThemeSelect/>
      </li>
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

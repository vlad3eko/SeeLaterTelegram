<template>
  <div class="text-accent-foreground bg-accent py-10 text-center flex flex-col gap-10">
    <ul class="flex gap-6 justify-center">
      <li>
        <NuxtLink to="/" class="text-xl uppercase font-bold text-primary hover:text-focus">Главная</NuxtLink>
      </li>
      <li>
        <NuxtLink to="/bookmarks" class="text-xl uppercase font-bold text-primary hover:text-focus">Сохранённые</NuxtLink>
      </li>
      <ThemeSelect/>
    </ul>
  </div>
</template>

<script lang="ts" setup>

import ThemeSelect from "~/components/composables/ThemeSelect.vue";
</script>

<style scoped>

</style>

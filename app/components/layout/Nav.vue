<template>
  <section class="text-accent-foreground bg-accent py-10 text-center flex flex-col gap-10">
    <h1 class="font-bold text-4xl italic">Фильмы</h1>
    <ul class="flex gap-6 justify-center">
      <li>
        <NuxtLink to="/" class="text-xl uppercase font-bold text-primary hover:text-focus">Главная</NuxtLink>
      </li>
      <li>
        <NuxtLink to="/create" class="text-xl uppercase font-bold text-primary hover:text-focus">Добавить</NuxtLink>
      </li>
      <li>
        <NuxtLink to="/bookmarks" class="text-xl uppercase font-bold text-primary hover:text-focus">Сохранённые</NuxtLink>
      </li>
    </ul>
  </section>
</template>

<script lang="ts" setup>

</script>

<style scoped>

</style>

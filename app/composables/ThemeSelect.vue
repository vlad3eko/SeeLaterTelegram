<template>
  <!-- system — значение colorMode по умолчанию; без этого пункта список показывался пустым -->
  <select v-model="$colorMode.preference" aria-label="Тема оформления"
          class="text-muted-foreground text-sm md:text-[1rem] cursor-pointer bg-transparent">
    <option value="system" class="cursor-pointer ">Системная</option>
    <option value="light" class="cursor-pointer ">Светлая</option>
    <option value="dark" class="cursor-pointer ">Тёмная</option>
  </select>
</template>

<script lang="ts" setup>

</script>

<style scoped>

</style>

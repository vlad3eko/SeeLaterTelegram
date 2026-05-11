<template>
  <section class="text-accent-foreground bg-accent py-10 text-center flex flex-col gap-10">
    <h1 class="font-bold text-4xl italic">Supa Smoothies</h1>
    <ul class="flex gap-6 justify-center">
      <li>
        <NuxtLink to="/" class="text-xl uppercase font-bold text-primary hover:text-focus">home</NuxtLink>
      </li>
      <li>
        <NuxtLink to="/create" class="text-xl uppercase font-bold text-primary hover:text-focus">Create</NuxtLink>
      </li>
      <li>
        <NuxtLink to="/update" class="text-xl uppercase font-bold text-primary hover:text-focus">Update</NuxtLink>
      </li>
    </ul>
  </section>
</template>

<script lang="ts" setup>

</script>

<style scoped>

</style>

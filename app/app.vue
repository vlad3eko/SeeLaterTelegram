<template>
  <NuxtLayout>
    <NuxtPage/>
  </NuxtLayout>
</template>

<script lang="ts" setup>
import {useUserStore} from "~/stores/user.store";

const user = useUserStore()

onMounted(user.refresh)

</script>

<style>

body {
  margin: 0;
  color: var(--color-accent-foreground);
  background-color: var(--color-background);
  font-family: 'Poppins', sans-serif;
}
</style>

<template>
  <Nav/>
  <div class="relative min-h-screen">
    <slot/>
  </div>
</template>
<script lang="ts" setup>

import Nav from "~/components/layout/Nav.vue";
</script>

<style scoped>

</style>

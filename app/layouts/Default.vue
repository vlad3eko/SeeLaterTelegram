<template>
  <Nav/>
  <div>
    <slot/>
  </div>
</template>

<script lang="ts" setup>

import Nav from "~/components/layout/Nav.vue";
import Loader from "~/components/composables/Loader.vue";
</script>

<style scoped>

</style>

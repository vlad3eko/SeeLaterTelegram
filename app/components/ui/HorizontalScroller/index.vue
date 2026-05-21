<template>
  <h1 class="text-2xl md:text-4xl font-bold">
    {{ title }}
  </h1>

  <div class="border-b border-accent-foreground/20"/>

  <div class="flex overflow-x-auto gap-3 w-full pb-3 text-accent-foreground/90">
    <slot/>
  </div>

  <!-- TODO разобрать что это и как использовать -->
  <!--{{ credits.cast[0].known_for_department }}-->
  <!--{{ credits.cast[0].character }}-->
  <!--{{ credits.cast[0].order }}-->
</template>

<script lang="ts" setup>

interface HorizontalList {
  title: string
}

defineProps<HorizontalList>()

</script>

<style scoped>

</style>

<template>
  <div class="max-w-200 mx-auto flex my-12 relative">
    <input
        type="text"
        id="title"
        v-model="model"
        @keydown.enter="emit('search')"
        class="h-11 border w-full rounded-xl p-3"/>
    <div class="h-full">
      <UiButton @click="emit('search')" class="absolute top-0.5 right-0 w-max py-2 px-12">Поиск</UiButton>
    </div>
  </div>
</template>

<script lang="ts" setup>

const model = defineModel<string>()

const emit = defineEmits<{
  search: []
}>()

</script>

<style scoped>

</style>

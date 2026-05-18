<template>
  <div class="w-max flex mx-auto my-12 relative">
    <input
        type="text"
        id="title"
        v-model="model"
        @keydown.enter="emit('search')"
        class="h-11 border mx-auto w-200 rounded-xl p-3"/>
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

const x = ref('')

</script>

<style scoped>

</style>


<template>
  <!-- Поле и кнопка в одном ряду: кнопка не наезжает на поле и не уходит за край на телефоне -->
  <!-- div, не form: в smoothies.css глобальный стиль form (белый фон, 480px) -->
  <div class="max-w-200 mx-auto flex gap-2 my-6 md:my-12 px-3" role="search">
    <input
        type="search"
        id="title"
        v-model="model"
        placeholder="Фильм или сериал"
        aria-label="Поиск фильмов и сериалов"
        enterkeyhint="search"
        @keydown.enter="emit('search')"
        class="h-11 border min-w-0 flex-1 rounded-xl px-3 text-base"/>
    <UiButton type="button" @click="emit('search')" class="shrink-0 h-11 px-5 md:px-12">Поиск</UiButton>
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

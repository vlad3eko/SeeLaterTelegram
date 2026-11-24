<template>
  <!-- Содержимое панели «кратко о тайтле»: название, описание, тип, жанры -->
  <template v-if="props.brief">
    <p class="font-bold">
      {{ props.brief.title }}
    </p>

    <p class="mt-2 text-sm line-clamp-5">
      {{ props.brief.overview }}
    </p>

    <p class="mt-2">
      {{ props.brief.type }}
    </p>

    <p class="mt-1 text-xs opacity-70">
      {{ props.brief.genres }}
    </p>
  </template>
  <p v-else-if="props.failed" class="text-sm opacity-70">Не удалось загрузить</p>
  <p v-else class="text-sm opacity-70">Загрузка…</p>
</template>

<script lang="ts" setup>

import type {MediaBrief} from "~/composables/useMediaBrief";

const props = defineProps<{
  brief: MediaBrief | null
  failed?: boolean
}>()

</script>

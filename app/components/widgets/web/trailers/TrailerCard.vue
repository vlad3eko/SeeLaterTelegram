<template>
  <div
       @click.prevent="handleSelect(props.item.key)">
    <div class="relative">
      <img
          :src="`https://img.youtube.com/vi/${props.item.key}/mqdefault.jpg`"
          class="w-full aspect-video object-cover"
          alt=""
      >
      <span class="absolute top-0 right-0 bg-card px-3 py-1 uppercase">{{props.item.iso_639_1}}</span>
    </div>
    <span class="absolute top-0 right-0 h-full opacity-0 w-full cursor-pointer">
    {{ props.item.name }}
    </span>
  </div>
</template>

<script lang="ts" setup>

import type {TmdbTrailer} from "~/types/tmdb.types";

interface Props {
  item: TmdbTrailer
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [string]
}>()

console.log('props', props.item.key)

const handleSelect = (key: string) => {
  emit('select', key)
}

</script>
